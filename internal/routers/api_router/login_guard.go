package api_router

import (
	"crypto/sha256"
	"fmt"
	"strings"
	"sync"
	"time"
)

const loginWindow = 15 * time.Minute
const maxLoginEntries = 10000

type loginAttempts struct {
	failures, pending int
	expires           time.Time
}

// Both login frontends reach the same handler. Reserve attempts before password
// verification so parallel requests cannot bypass the failure threshold.
type loginGuard struct {
	mu          sync.Mutex
	entries     map[string]*loginAttempts
	lastCleanup time.Time
	now         func() time.Time
}

func newLoginGuard() *loginGuard {
	return &loginGuard{entries: make(map[string]*loginAttempts), now: time.Now}
}

func (g *loginGuard) begin(ip, credentials string) (finish func(failed, success bool), retry time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	if now.Sub(g.lastCleanup) >= time.Minute {
		for key, entry := range g.entries {
			if entry.pending == 0 && !now.Before(entry.expires) {
				delete(g.entries, key)
			}
		}
		g.lastCleanup = now
	}
	keys := [2]string{"ip:" + ip, fmt.Sprintf("account:%x", sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(credentials)))))}
	limits := [2]int{20, 5}
	var entries [2]*loginAttempts
	missing := 0
	for i, key := range keys {
		entry := g.entries[key]
		if entry == nil {
			missing++
			continue
		}
		if !now.Before(entry.expires) {
			entry.failures = 0
		}
		if entry.failures+entry.pending >= limits[i] {
			wait := entry.expires.Sub(now)
			if wait < time.Second {
				wait = time.Second
			}
			if wait > retry {
				retry = wait
			}
		}
		entries[i] = entry
	}
	if retry > 0 {
		return nil, retry
	}
	// Never evict active bans when attackers generate new account names.
	if len(g.entries)+missing > maxLoginEntries {
		return nil, time.Minute
	}
	for i, key := range keys {
		if entries[i] == nil {
			entries[i] = &loginAttempts{}
			g.entries[key] = entries[i]
		}
		if !now.Before(entries[i].expires) {
			entries[i].expires = now.Add(loginWindow)
		}
		entries[i].pending++
	}
	return func(failed, success bool) {
		g.mu.Lock()
		defer g.mu.Unlock()
		for i, entry := range entries {
			entry.pending--
			if failed {
				entry.failures++
				if entry.failures == limits[i] {
					entry.expires = g.now().Add(loginWindow)
				}
			} else if success && i == 1 {
				// Keep aggregate IP failures: a known valid account must not erase them.
				entry.failures = 0
			}
			if entry.pending == 0 && entry.failures == 0 {
				delete(g.entries, keys[i])
			}
		}
	}, 0
}
