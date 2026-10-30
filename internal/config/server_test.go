package config

import (
	"bytes"
	"encoding/json"
	"gopkg.in/yaml.v3"
	"strings"
	"testing"
)

func TestESAProxyConfiguration(t *testing.T) {
	t.Setenv("FNS_ESA_REAL_IP", "")
	t.Setenv("FNS_ESA_ORIGIN_SECRET", "")
	t.Setenv("FNS_TRUSTED_PROXIES", "")
	c := ServerConfig{ESARealIP: true, TrustedProxies: []string{"2001:db8:100::/48"}}
	if err := c.ApplyProxyEnv(); err != nil {
		t.Fatal(err)
	}
	if !c.ESARealIP || len(c.TrustedProxies) != 1 {
		t.Fatal("empty Compose env erased YAML")
	}
	t.Setenv("FNS_TRUSTED_PROXIES", "192.0.2.1, 2001:db8:200::/48\n198.51.100.0/24")
	if err := c.ApplyProxyEnv(); err != nil {
		t.Fatal(err)
	}
	if len(c.TrustedProxies) != 3 {
		t.Fatalf("unexpected proxies: %v", c.TrustedProxies)
	}
	t.Setenv("FNS_TRUSTED_PROXIES", "")
	for _, proxies := range [][]string{nil, {"::/0"}, {"0.0.0.0/0"}, {"invalid"}} {
		c := ServerConfig{ESARealIP: true, TrustedProxies: proxies}
		if c.ApplyProxyEnv() == nil {
			t.Errorf("unsafe ESA config accepted: %v", proxies)
		}
	}
	t.Setenv("FNS_ESA_REAL_IP", "invalid")
	if c.ApplyProxyEnv() == nil {
		t.Fatal("invalid boolean accepted")
	}
}

func TestESASecretConfigAndRedaction(t *testing.T) {
	const secret = "unit-test-origin-key-at-least-32-characters"
	t.Setenv("FNS_ESA_REAL_IP", "true")
	t.Setenv("FNS_TRUSTED_PROXIES", "")
	t.Setenv("FNS_ESA_ORIGIN_SECRET", secret)
	c := ServerConfig{}
	if err := c.ApplyProxyEnv(); err != nil {
		t.Fatal(err)
	}
	if !c.ESARealIP || c.ESAOriginSecret != secret || len(c.TrustedProxies) != 0 {
		t.Fatal("free-plan secret mode not applied")
	}
	data, err := json.Marshal(c)
	if err != nil || bytes.Contains(data, []byte(secret)) {
		t.Fatal("JSON exported origin credential")
	}
	data, err = yaml.Marshal(c)
	if err != nil || bytes.Contains(data, []byte(secret)) {
		t.Fatal("YAML exported origin credential")
	}
	for _, value := range []string{"too-short", strings.Repeat("x", 257), strings.Repeat("x", 32) + "\n"} {
		t.Setenv("FNS_ESA_ORIGIN_SECRET", value)
		c := ServerConfig{}
		if err := c.ApplyProxyEnv(); err == nil || strings.Contains(err.Error(), value) {
			t.Fatal("unsafe credential accepted or disclosed")
		}
	}
	t.Setenv("FNS_ESA_ORIGIN_SECRET", secret)
	t.Setenv("FNS_ESA_REAL_IP", "false")
	if (&ServerConfig{}).ApplyProxyEnv() == nil {
		t.Fatal("unused origin credential silently accepted")
	}
}
