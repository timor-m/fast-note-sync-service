package config

import "testing"

func TestESAProxyConfiguration(t *testing.T) {
	t.Setenv("FNS_ESA_REAL_IP", "")
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
