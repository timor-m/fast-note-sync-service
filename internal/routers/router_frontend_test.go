package routers

import (
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
	router.Use(middleware.Proxy(nil), frontendProxy(config.FrontendConfig{Enabled: true, Target: upstream.URL, Timeout: "1s"}))
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
