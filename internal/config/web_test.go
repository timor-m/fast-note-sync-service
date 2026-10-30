package config

import "testing"

func TestFrontendConfig(t *testing.T) {
	for _, target := range []string{"http://fast-note-sync-web:3000", "https://web.internal"} {
		if err := (FrontendConfig{Enabled: true, Target: target, Timeout: "30s"}).Validate(); err != nil {
			t.Fatal(err)
		}
	}
	for _, target := range []string{"", "ftp://host", "http://user:pass@host", "http://host/path", "http://host?x=1", "http://host#frag", "http://:3000"} {
		if err := (FrontendConfig{Enabled: true, Target: target, Timeout: "30s"}).Validate(); err == nil {
			t.Errorf("accepted %q", target)
		}
	}
	for _, timeout := range []string{"0s", "bad", "-1s"} {
		if err := (FrontendConfig{Enabled: true, Target: "http://web:3000", Timeout: timeout}).Validate(); err == nil {
			t.Errorf("accepted %q", timeout)
		}
	}
}
func TestFrontendEnv(t *testing.T) {
	t.Setenv("FNS_WEB_FRONTEND_ENABLED", "true")
	t.Setenv("FNS_WEB_FRONTEND_TARGET", "http://web:3000")
	t.Setenv("FNS_WEB_FRONTEND_TIMEOUT", "5s")
	t.Setenv("FNS_WEB_FRONTEND_FALLBACK", "false")
	var c FrontendConfig
	if err := c.ApplyEnv(); err != nil {
		t.Fatal(err)
	}
	if !c.Enabled || c.Target != "http://web:3000" || c.Timeout != "5s" || c.Fallback == nil || *c.Fallback {
		t.Fatalf("unexpected config: %+v", c)
	}
	t.Setenv("FNS_WEB_FRONTEND_ENABLED", "invalid")
	if c.ApplyEnv() == nil {
		t.Fatal("accepted invalid boolean")
	}
}
