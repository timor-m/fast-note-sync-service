package routers

import (
	"context"
	"embed"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/creasty/defaults"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/haierkeys/fast-note-sync-service/internal/app"
	"github.com/haierkeys/fast-note-sync-service/internal/config"
	"github.com/haierkeys/fast-note-sync-service/internal/domain"
	"github.com/haierkeys/fast-note-sync-service/internal/middleware"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func TestFrontendAllowlist(t *testing.T) {
	for _, path := range []string{"/", "/login", "/kb/demo", "/s/token", "/app", "/app/deep", "/_nuxt/app.js", "/api/frontend/auth/login"} {
		if !frontendPath(path) {
			t.Errorf("missing %s", path)
		}
	}
	for _, path := range []string{"/webgui/", "/assets/main.js", "/static/icon.svg", "/share/1/token", "/api/user/login", "/api/user/info", "/api/vault", "/api/notes", "/api/file", "/api/share/note", "/api/mcp", "/api/mcp/sse", "/api/mcp/message", "/api/user/sync", "/attachments/1/v/a.png", "/oauth/authorize", "/unknown", "/application", "/api/frontend-evil"} {
		if frontendPath(path) {
			t.Errorf("hijacks %s", path)
		}
	}
}
func TestFrontendProxyMetadata(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/s/token?id=42&x=a%2Fb" || r.Host != "notes.example" || r.Header.Get("Cookie") != "session=test" || r.Header.Get("X-Forwarded-Proto") != "http" || r.Header.Get("X-Forwarded-Host") != "notes.example" || r.Header.Get("X-Forwarded-For") != "192.0.2.1" || r.Header.Get("Forwarded") != "" {
			t.Errorf("bad metadata: %s %s %+v", r.URL, r.Host, r.Header)
		}
		w.Header().Set("Set-Cookie", "test=yes; HttpOnly")
		_, _ = w.Write([]byte("nuxt"))
	}))
	defer upstream.Close()
	router := gin.New()
	middleware.ConfigureProxy(router, nil, false, "")
	router.Use(frontendProxy(config.FrontendConfig{Enabled: true, Target: upstream.URL, Timeout: "1s"}))
	router.GET("/s/:token", func(c *gin.Context) { t.Error("reached legacy handler") })
	req := httptest.NewRequest("GET", "http://notes.example/s/token?id=42&x=a%2Fb", nil)
	req.Header.Set("Cookie", "session=test")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-For", "203.0.113.42")
	req.Header.Set("Forwarded", "host=attacker")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != 200 || res.Body.String() != "nuxt" || res.Header().Get("Set-Cookie") == "" {
		t.Fatalf("bad response %+v", res)
	}
}
func TestFrontendDisabledAndOutage(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		fallback := true
		router := gin.New()
		router.Use(frontendProxy(config.FrontendConfig{Enabled: enabled, Target: "http://127.0.0.1:1", Timeout: "20ms", Fallback: &fallback}))
		router.GET("/", func(c *gin.Context) { c.Redirect(302, "/webgui") })
		router.GET("/api/health", func(c *gin.Context) { c.String(200, "healthy") })
		for _, path := range []string{"/", "/api/frontend/auth/me", "/api/health", "/unknown"} {
			res := httptest.NewRecorder()
			router.ServeHTTP(res, httptest.NewRequest("GET", path, nil))
			expected := 404
			if path == "/" {
				expected = 302
				if enabled {
					expected = 503
				}
			}
			if path == "/api/frontend/auth/me" && enabled {
				expected = 502
			}
			if path == "/api/health" {
				expected = 200
			}
			if res.Code != expected {
				t.Errorf("enabled=%v %s: %d != %d", enabled, path, res.Code, expected)
			}
		}
	}
}
func TestFrontendTimeout(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { time.Sleep(60 * time.Millisecond) }))
	defer upstream.Close()
	router := gin.New()
	router.Use(frontendProxy(config.FrontendConfig{Enabled: true, Target: upstream.URL, Timeout: "10ms"}))
	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest("GET", "/api/frontend/health", nil))
	if res.Code != 504 && res.Code != 502 {
		t.Fatalf("timeout returned %d", res.Code)
	}
}

// Instantiate the real API registrar: Gin must accept frontend BFF routing alongside
// existing auth, MCP and WebSocket routes without wildcard conflicts.
func TestFrontendRealRouterRegistration(t *testing.T) {
	cfg := &app.AppConfig{}
	if err := defaults.Set(cfg); err != nil {
		t.Fatal(err)
	}
	cfg.Web.Frontend.Enabled = true
	cfg.Web.Frontend.Target = "http://127.0.0.1:1"
	t.Chdir(t.TempDir())
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	a, err := app.NewApp(cfg, zap.NewNop(), db, embed.FS{})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	router := NewRouter(embed.FS{}, a, nil)
	router.GET("/test-client-ip", func(c *gin.Context) { c.String(200, c.ClientIP()) })
	for _, test := range []struct{ peer, forwarded, want string }{
		{"198.51.100.8:1234", "192.0.2.123", "198.51.100.8"},
		{"127.0.0.1:1234", "192.0.2.123", "192.0.2.123"},
		{"127.0.0.1:1234", "192.0.2.123, 198.51.100.8", "198.51.100.8"},
	} {
		request := httptest.NewRequest("GET", "/test-client-ip", nil)
		request.RemoteAddr = test.peer
		request.Header.Set("X-Forwarded-For", test.forwarded)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Body.String() != test.want {
			t.Errorf("peer %s: client IP = %s, want %s", test.peer, response.Body.String(), test.want)
		}
	}
	paths := map[string]bool{}
	for _, route := range router.Routes() {
		paths[route.Path] = true
	}
	for _, path := range []string{"/api/user/login", "/api/user/info", "/api/vault", "/api/note", "/api/file", "/api/share/note", "/api/user/sync", "/api/mcp", "/api/mcp/sse", "/webgui/", "/share/:side/:token"} {
		if !paths[path] {
			t.Errorf("missing route %s", path)
		}
	}
	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest("GET", "/unknown", nil))
	if strings.Contains(res.Body.String(), "前台") {
		t.Fatal("unknown route intercepted")
	}
}

// Only note shares reach Nuxt. Merely choosing a renderer never authorizes a
// resource or records a view; the unchanged share API still performs both.
type rendererShareRepo struct {
	domain.UserShareRepository
	share *domain.UserShare
}

func (r rendererShareRepo) GetByID(context.Context, int64, int64) (*domain.UserShare, error) {
	return r.share, nil
}

func TestLegacyShareNuxtProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Chdir(t.TempDir())
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Renderer", "nuxt")
		w.Write([]byte(r.URL.RequestURI()))
	}))
	defer upstream.Close()
	cfg := &app.AppConfig{}
	if err := defaults.Set(cfg); err != nil {
		t.Fatal(err)
	}
	cfg.Web.Frontend.Enabled = true
	cfg.Web.Frontend.Target = upstream.URL
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	a, err := app.NewApp(cfg, zap.NewNop(), db, embed.FS{})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	share := &domain.UserShare{ResID: 42, ResType: "note"}
	a.ShareRepo = rendererShareRepo{share: share}
	token, err := a.TokenManager.ShareGenerate(1, 1, map[string][]string{"note": {"42"}})
	if err != nil {
		t.Fatal(err)
	}
	path := "/share/42/" + token
	for _, separate := range []bool{false, true} {
		var router *gin.Engine
		for _, test := range []struct {
			enabled    bool
			kind, path string
			proxied    bool
		}{
			{true, "note", path, true}, {false, "note", path, false}, {true, "file", path, false},
			{true, "note", "/share/43/" + token, false}, {true, "note", "/share/42/invalid", false},
		} {
			cfg.Web.Frontend.Enabled = test.enabled
			share.ResType = test.kind
			// The route captures configuration at registration, matching server startup.
			if separate {
				router = NewShareRouter(embed.FS{}, a)
			} else {
				router = NewRouter(embed.FS{}, a, nil)
			}
			res := httptest.NewRecorder()
			router.ServeHTTP(res, httptest.NewRequest("GET", test.path, nil))
			if res.Code != 200 || res.Header().Get("Location") != "" || (res.Header().Get("X-Renderer") == "nuxt") != test.proxied {
				t.Fatalf("separate=%v case=%+v status=%d headers=%v", separate, test, res.Code, res.Header())
			}
			if test.proxied && res.Body.String() != path {
				t.Fatalf("proxy changed URL: %s", res.Body.String())
			}
		}
		if separate {
			for _, endpoint := range []string{"/s/token?id=42", "/_nuxt/app.js", "/api/frontend/shares/meta?id=42", "/app"} {
				res := httptest.NewRecorder()
				router.ServeHTTP(res, httptest.NewRequest("GET", endpoint, nil))
				if (res.Header().Get("X-Renderer") == "nuxt") != (endpoint != "/app") {
					t.Fatalf("unexpected separate share port exposure: %s", endpoint)
				}
			}
		}
	}
}

func TestESAVisitorIPReachesNuxtWithoutRawHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ip := r.Header.Get("X-Forwarded-For"); ip != "2001:db8:200::8" {
			t.Errorf("Nuxt visitor = %q", ip)
		}
		for _, header := range []string{"ali-real-client-ip", "X-Real-IP", "CF-Connecting-IP", "Forwarded"} {
			if r.Header.Get(header) != "" {
				t.Errorf("raw %s reached Nuxt", header)
			}
		}
		w.Write([]byte("ok"))
	}))
	defer upstream.Close()
	router := gin.New()
	middleware.ConfigureProxy(router, []string{"2001:db8:100::/48"}, true, "")
	router.Use(frontendProxy(config.FrontendConfig{Enabled: true, Target: upstream.URL, Timeout: "1s"}))
	req := httptest.NewRequest("GET", "/app", nil)
	req.RemoteAddr = "[2001:db8:100::1]:443"
	req.Header.Set("ali-real-client-ip", "2001:db8:200::8")
	req.Header.Set("X-Forwarded-For", "203.0.113.99")
	req.Header.Set("X-Real-IP", "203.0.113.98")
	req.Header.Set("CF-Connecting-IP", "203.0.113.97")
	req.Header.Set("Forwarded", "for=203.0.113.96")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != 200 || res.Body.String() != "ok" {
		t.Fatalf("bad response: %d %s", res.Code, res.Body.String())
	}
}

func TestESAOriginSecretIsNotForwardedToNuxt(t *testing.T) {
	const secret = "unit-test-origin-key-at-least-32-characters"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-FNS-Origin-Key") != "" || r.Header.Get("ali-real-client-ip") != "" {
			t.Error("raw ESA credentials reached Nuxt")
		}
		if r.Header.Get("X-Forwarded-For") != "2001:db8:200::8" {
			t.Error("visitor IP was not normalized")
		}
		w.Write([]byte("ok"))
	}))
	defer upstream.Close()
	router := gin.New()
	middleware.ConfigureProxy(router, nil, true, secret)
	router.Use(frontendProxy(config.FrontendConfig{Enabled: true, Target: upstream.URL, Timeout: "1s"}))
	req := httptest.NewRequest("GET", "/app", nil)
	req.RemoteAddr = "[2001:db8:100::1]:443"
	req.Header.Set("X-FNS-Origin-Key", secret)
	req.Header.Set("ali-real-client-ip", "2001:db8:200::8")
	req.Header.Set("X-Forwarded-For", "203.0.113.99")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != 200 || res.Body.String() != "ok" {
		t.Fatal("proxy failed")
	}
}
