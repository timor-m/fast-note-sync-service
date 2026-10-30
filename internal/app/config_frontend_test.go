package app

import "testing"

func TestLoadConfig_FrontendDefaultsAndExplicitFalse(t *testing.T) {
	cfg, _, err := LoadConfig(writeTestConfig(t, "{}"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Web.Frontend.Enabled || cfg.Web.Frontend.Target != "http://127.0.0.1:3000" || cfg.Web.Frontend.Fallback == nil || !*cfg.Web.Frontend.Fallback {
		t.Fatalf("bad defaults: %+v", cfg.Web.Frontend)
	}
	cfg, _, err = LoadConfig(writeTestConfig(t, "web:\n  frontend:\n    enabled: false\n    fallback: false\n"))
	if err != nil {
		t.Fatal(err)
	}
	if *cfg.Web.Frontend.Fallback {
		t.Fatal("explicit false overwritten")
	}
}
func TestLoadConfig_FrontendEnvOverridesYAML(t *testing.T) {
	t.Setenv("FNS_WEB_FRONTEND_ENABLED", "true")
	t.Setenv("FNS_WEB_FRONTEND_TARGET", "http://fast-note-sync-web:3000")
	cfg, _, err := LoadConfig(writeTestConfig(t, "web:\n  frontend:\n    enabled: false\n"))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Web.Frontend.Enabled || cfg.Web.Frontend.Target != "http://fast-note-sync-web:3000" {
		t.Fatal("environment override not applied")
	}
	t.Setenv("FNS_WEB_FRONTEND_TARGET", "http://web:3000/wrong-prefix")
	if _, _, err := LoadConfig(writeTestConfig(t, "{}")); err == nil {
		t.Fatal("invalid target accepted")
	}
}
