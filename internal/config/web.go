package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"
)

type WebConfig struct {
	Frontend FrontendConfig `yaml:"frontend"`
}

type FrontendConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Target   string `yaml:"target" default:"http://127.0.0.1:3000"`
	Timeout  string `yaml:"timeout" default:"30s"`
	Fallback *bool  `yaml:"fallback" default:"true"`
}

// ApplyEnv supports independent Docker deployment without rewriting mounted YAML.
func (c *FrontendConfig) ApplyEnv() error {
	if value, ok := os.LookupEnv("FNS_WEB_FRONTEND_ENABLED"); ok {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("FNS_WEB_FRONTEND_ENABLED must be a boolean")
		}
		c.Enabled = parsed
	}
	if value, ok := os.LookupEnv("FNS_WEB_FRONTEND_FALLBACK"); ok {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("FNS_WEB_FRONTEND_FALLBACK must be a boolean")
		}
		c.Fallback = &parsed
	}
	if value, ok := os.LookupEnv("FNS_WEB_FRONTEND_TARGET"); ok {
		c.Target = value
	}
	if value, ok := os.LookupEnv("FNS_WEB_FRONTEND_TIMEOUT"); ok {
		c.Timeout = value
	}
	return c.Validate()
}

func (c FrontendConfig) Validate() error {
	if !c.Enabled {
		return nil
	}
	target, err := url.Parse(c.Target)
	if err != nil || target == nil || target.Hostname() == "" || (target.Scheme != "http" && target.Scheme != "https") || target.User != nil || target.RawQuery != "" || target.Fragment != "" || (target.Path != "" && target.Path != "/") {
		return fmt.Errorf("web.frontend.target must be an HTTP(S) origin without credentials, path, query or fragment")
	}
	timeout, err := time.ParseDuration(c.Timeout)
	if err != nil || timeout <= 0 {
		return fmt.Errorf("web.frontend.timeout must be a positive duration")
	}
	return nil
}
