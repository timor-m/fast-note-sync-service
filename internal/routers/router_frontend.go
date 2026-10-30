package routers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/haierkeys/fast-note-sync-service/internal/config"
)

// frontendPath is deliberately an allowlist: unknown paths keep Go's behavior.
func frontendPath(path string) bool {
	if path == "/" || path == "/login" {
		return true
	}
	for _, prefix := range []string{"/kb", "/s", "/app"} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return strings.HasPrefix(path, "/_nuxt/") || strings.HasPrefix(path, "/api/frontend/")
}

func frontendProxy(cfg config.FrontendConfig) gin.HandlerFunc {
	proxy := frontendReverseProxy(cfg)
	return func(c *gin.Context) {
		if frontendPath(c.Request.URL.Path) {
			proxy(c)
			return
		}
		c.Next()
	}
}

// Explicit share routes use the same proxy without widening the global allowlist.
func frontendReverseProxy(cfg config.FrontendConfig) gin.HandlerFunc {
	if !cfg.Enabled {
		return func(c *gin.Context) { c.Next() }
	}
	target, err := url.Parse(cfg.Target)
	// LoadConfig validates this before starting the server. Guard direct callers too.
	if err != nil || cfg.Validate() != nil {
		return func(c *gin.Context) { c.Next() }
	}
	timeout, _ := time.ParseDuration(cfg.Timeout)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = timeout
	proxy := &httputil.ReverseProxy{
		Transport: transport,
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = r.In.Host
			// The incoming values below are sanitized by our handler using Gin's trusted proxies.
			r.Out.Header.Set("X-Forwarded-Host", r.In.Host)
			r.Out.Header.Set("X-Forwarded-Proto", r.In.URL.Scheme)
			r.Out.Header.Set("X-Forwarded-For", r.In.Header.Get("X-Forwarded-For"))
			// Do not pass client-controlled alternate forwarding metadata to Nitro.
			r.Out.Header.Del("Forwarded")
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			w.Header().Set("Cache-Control", "no-store")
			if cfg.Fallback != nil && *cfg.Fallback && !strings.HasPrefix(r.URL.Path, "/api/frontend/") && !strings.HasPrefix(r.URL.Path, "/_nuxt/") {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>前台暂不可用</title><h1>前台暂时无法连接</h1><p>同步服务仍可使用，请稍后重试。</p></html>`))
				return
			}
			status := http.StatusBadGateway
			if errors.Is(err, context.DeadlineExceeded) {
				status = http.StatusGatewayTimeout
			}
			http.Error(w, "前台暂时无法连接，请稍后重试", status)
		},
	}
	return func(c *gin.Context) {
		// Snapshot request metadata after Proxy middleware; never trust raw browser forwarding headers.
		req := c.Request.Clone(c.Request.Context())
		req.Header.Set("X-Forwarded-For", c.ClientIP())
		req.Header.Del("Ali-Real-Client-IP")
		req.Header.Del("X-Real-IP")
		req.Header.Del("CF-Connecting-IP")
		if req.URL.Scheme != "https" {
			req.URL.Scheme = "http"
		}
		ctx, cancel := context.WithTimeout(req.Context(), timeout)
		defer cancel()
		proxy.ServeHTTP(c.Writer, req.WithContext(ctx))
		c.Abort()
	}
}
