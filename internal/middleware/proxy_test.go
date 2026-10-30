package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestESARealIPTrustBoundary(t *testing.T) {
	for _, test := range []struct {
		name, peer, real, forwarded, want string
		enabled                           bool
	}{
		{"IPv6 origin with IPv4 visitor", "[2001:db8:100::1]:443", "198.51.100.20", "203.0.113.99", "198.51.100.20", true},
		{"IPv6 visitor canonicalized", "[2001:db8:100::2]:443", "2001:0db8:200:0::8", "203.0.113.99", "2001:db8:200::8", true},
		{"IPv4 origin", "192.0.2.10:443", "198.51.100.20", "203.0.113.99", "198.51.100.20", true},
		{"direct spoof ignored", "198.51.100.10:443", "198.51.100.20", "203.0.113.99", "198.51.100.10", true},
		{"missing ESA header ignores forged XFF", "[2001:db8:100::1]:443", "", "203.0.113.99", "2001:db8:100::1", true},
		{"invalid ESA header ignores forged XFF", "[2001:db8:100::1]:443", "not-an-ip", "203.0.113.99", "2001:db8:100::1", true},
		{"ESA chain rejected", "[2001:db8:100::1]:443", "198.51.100.20, 198.51.100.21", "203.0.113.99", "2001:db8:100::1", true},
		{"disabled preserves standard proxy", "[2001:db8:100::1]:443", "198.51.100.20", "203.0.113.99", "203.0.113.99", false},
		{"Nuxt internal BFF preserves visitor", "127.0.0.1:1234", "", "198.51.100.20", "198.51.100.20", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			router := gin.New()
			ConfigureProxy(router, []string{"2001:db8:100::/48", "192.0.2.0/24"}, test.enabled)
			router.GET("/ip", func(c *gin.Context) { c.String(200, c.ClientIP()) })
			req := httptest.NewRequest("GET", "/ip", nil)
			req.RemoteAddr = test.peer
			req.Header.Set("ali-real-client-ip", test.real)
			req.Header.Set("X-Forwarded-For", test.forwarded)
			req.Header.Set("X-Real-IP", "203.0.113.98")
			res := httptest.NewRecorder()
			router.ServeHTTP(res, req)
			if res.Body.String() != test.want {
				t.Fatalf("IP = %q, want %q", res.Body.String(), test.want)
			}
		})
	}
}
