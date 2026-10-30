package config

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
)

// ServerConfig server configuration
// ServerConfig 服务器配置
type ServerConfig struct {
	// RunMode run mode
	// RunMode 运行模式
	RunMode string `yaml:"run-mode" default:"release"`
	// HttpPort HTTP port
	// HttpPort HTTP 端口
	HttpPort string `yaml:"http-port" default:":9000"`
	// ReadTimeout read timeout (seconds)
	// ReadTimeout 读取超时（秒）
	ReadTimeout int `yaml:"read-timeout" default:"60"`
	// WriteTimeout write timeout (seconds)
	// WriteTimeout 写入超时（秒）
	WriteTimeout int `yaml:"write-timeout" default:"60"`
	// PrivateHttpListen private HTTP listen address
	// PrivateHttpListen 私有 HTTP 监听地址
	PrivateHttpListen string `yaml:"private-http-listen"`
	// WebGuiPort independent WebGUI port
	// WebGuiPort 独立 Web 界面端口
	WebGuiPort string `yaml:"webgui-port"`
	// SharePort independent share page port
	// SharePort 独立分享页面端口
	SharePort string `yaml:"share-port"`
	// ExtApiUrl external API URL
	// ExtApiUrl external API URL
	// ExtApiUrl 外部访问 API 的地址
	ExtApiUrl          string   `yaml:"ext-api-url"`
	CORSAllowedOrigins []string `yaml:"cors-allowed-origins"` // CORSAllowedOrigins allowed origins for CORS / CORSAllowedOrigins 跨域允许源白名单
	ESARealIP          bool     `yaml:"esa-real-ip"`          // Trust ali-real-client-ip only from configured proxies.
	TrustedProxies     []string `yaml:"trusted-proxies"`      // TrustedProxies trusted proxies IP/CIDR list / TrustedProxies 可信代理 IP/CIDR 列表

	// ShareBaseUrl external share page base URL
	// ShareBaseUrl 外部分享页面基础 URL
	ShareBaseUrl string `yaml:"share-base-url"`
	// MCPSSEPingInterval MCP SSE ping interval (seconds)
	// MCPSSEPingInterval MCP SSE 保活心跳间隔（秒）
	MCPSSEPingInterval int `yaml:"mcp-sse-ping-interval" default:"30"`
	// MCPDisableLocalhostProtection disables MCP DNS rebinding protection for trusted loopback proxies
	// MCPDisableLocalhostProtection 为可信的本机反向代理关闭 MCP DNS 重绑定保护
	MCPDisableLocalhostProtection bool `yaml:"mcp-disable-localhost-protection"`
	// CustomResponseHeaders custom response headers for all requests
	// CustomResponseHeaders 所有请求的自定义响应头
	CustomResponseHeaders map[string]string `yaml:"custom-response-headers"` // Custom response headers mapped to string
}

// ApplyProxyEnv preserves mounted YAML unless an explicit nonempty override is supplied.
func (c *ServerConfig) ApplyProxyEnv() error {
	if value := strings.TrimSpace(os.Getenv("FNS_ESA_REAL_IP")); value != "" {
		enabled, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("FNS_ESA_REAL_IP must be a boolean")
		}
		c.ESARealIP = enabled
	}
	if value := strings.TrimSpace(os.Getenv("FNS_TRUSTED_PROXIES")); value != "" {
		c.TrustedProxies = strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ';' || r == ' ' || r == '\n' || r == '\t' || r == '\r' })
	}
	if c.ESARealIP && len(c.TrustedProxies) == 0 {
		return fmt.Errorf("server.esa-real-ip requires explicit trusted-proxies containing the ESA origin IPs/CIDRs")
	}
	for _, proxy := range c.TrustedProxies {
		if net.ParseIP(proxy) != nil {
			continue
		}
		_, network, err := net.ParseCIDR(proxy)
		if err != nil {
			return fmt.Errorf("invalid server.trusted-proxies entry: %s", proxy)
		}
		ones, _ := network.Mask.Size()
		if c.ESARealIP && ones == 0 {
			return fmt.Errorf("ESA real IP must not trust all IPv4 or IPv6 sources")
		}
	}
	return nil
}
