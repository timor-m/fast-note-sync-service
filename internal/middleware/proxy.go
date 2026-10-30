package middleware

import (
	"crypto/tls"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// Proxy handles proxy headers and restores original request information based on trusted proxies
// Proxy 根据可信代理处理代理头部并恢复原始请求信息
func ConfigureProxy(r *gin.Engine, trustedProxies []string, esaRealIP bool) {
	// Nuxt is a private loopback proxy; other trusted sources must be explicit.
	proxies := append([]string{"127.0.0.1", "::1"}, trustedProxies...)
	if err := r.SetTrustedProxies(proxies); err != nil {
		panic(err)
	}
	r.Use(Proxy(trustedProxies, esaRealIP))
}

func Proxy(trustedProxies []string, esaRealIP ...bool) gin.HandlerFunc {
	// If trustedProxies is empty, default to loopback addresses only
	// 如果 trustedProxies 为空，默认只信任本地回环地址
	if len(trustedProxies) == 0 {
		trustedProxies = []string{"127.0.0.1", "::1"}
	}

	var trustedIPs []net.IP
	var trustedSubnets []*net.IPNet

	for _, proxy := range trustedProxies {
		if ip := net.ParseIP(proxy); ip != nil {
			trustedIPs = append(trustedIPs, ip)
		} else if _, subnet, err := net.ParseCIDR(proxy); err == nil {
			trustedSubnets = append(trustedSubnets, subnet)
		}
	}

	isTrusted := func(ipStr string) bool {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			return false
		}
		for _, tip := range trustedIPs {
			if tip.Equal(ip) {
				return true
			}
		}
		for _, subnet := range trustedSubnets {
			if subnet.Contains(ip) {
				return true
			}
		}
		return false
	}

	return func(c *gin.Context) {
		remoteHost, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
		trusted := isTrusted(remoteHost)

		proto := ""
		if trusted {
			proto = c.GetHeader("X-Forwarded-Proto")
		}

		if proto == "" {
			if c.Request.TLS != nil {
				proto = "https"
			} else {
				proto = "http"
			}
		}

		// Update Request URL Scheme
		// 更新请求 URL 的 Scheme
		c.Request.URL.Scheme = proto

		// If protocol is https but TLS is nil (due to proxy termination),
		// we "fake" a TLS state to satisfy libraries that check r.TLS != nil
		// 如果协议是 https 但 TLS 为 nil（由于代理终止），
		// 我们“伪造”一个 TLS 状态以满足检查 r.TLS != nil 的库
		if proto == "https" && c.Request.TLS == nil {
			c.Request.TLS = &tls.ConnectionState{}
		}

		// Detect host from X-Forwarded-Host if connection is trusted
		// 如果连接可信，则从 X-Forwarded-Host 检测主机名
		if trusted {
			if host := c.GetHeader("X-Forwarded-Host"); host != "" {
				c.Request.Host = host
			}
		}

		if len(esaRealIP) > 0 && esaRealIP[0] && trusted {
			// ESA adds a single IP, never a forwarding chain. Do not fall back to an
			// attacker-controlled XFF when ESA's header is absent or invalid.
			values := c.Request.Header.Values("ali-real-client-ip")
			if len(values) == 1 {
				if ip := net.ParseIP(strings.TrimSpace(values[0])); ip != nil {
					c.Request.RemoteAddr = net.JoinHostPort(ip.String(), "0")
				}
			}
			c.Request.Header.Del("X-Forwarded-For")
			c.Request.Header.Del("X-Real-IP")
			c.Request.Header.Del("CF-Connecting-IP")
		} else if remoteHost == "127.0.0.1" || remoteHost == "::1" {
			// Preserve local cloudflared compatibility, including IPv6 clients.
			if ip := net.ParseIP(c.GetHeader("CF-Connecting-IP")); ip != nil {
				c.Request.RemoteAddr = net.JoinHostPort(ip.String(), "0")
				c.Request.Header.Del("X-Forwarded-For")
				c.Request.Header.Del("X-Real-IP")
			}
		}

		c.Next()
	}
}
