package api_router

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLoginGuardAccountCooldownAndNormalization(t *testing.T) {
	g := newLoginGuard()
	now := time.Unix(1000, 0)
	g.now = func() time.Time { return now }
	for i := 0; i < 5; i++ {
		finish, retry := g.begin(fmt.Sprint(i), " USER@Example.com ")
		if retry != 0 {
			t.Fatal("blocked before threshold")
		}
		finish(true, false)
	}
	if _, retry := g.begin("another-ip", "user@example.com"); retry != loginWindow {
		t.Fatalf("cooldown = %v", retry)
	}
	now = now.Add(loginWindow - time.Second)
	if _, retry := g.begin("another-ip", "user@example.com"); retry != time.Second {
		t.Fatalf("cooldown extended: %v", retry)
	}
	now = now.Add(time.Second)
	finish, retry := g.begin("another-ip", "user@example.com")
	if retry != 0 {
		t.Fatal("still blocked after cooldown")
	}
	finish(false, true)
}

func TestLoginGuardIPAndSuccessReset(t *testing.T) {
	g := newLoginGuard()
	// Successful authentication clears this account's errors, not the IP total.
	for i := 0; i < 4; i++ {
		finish, _ := g.begin("client", "user")
		finish(true, false)
	}
	finish, _ := g.begin("client", "user")
	finish(false, true)
	for i := 0; i < 4; i++ {
		finish, retry := g.begin(fmt.Sprint(i), "user")
		if retry != 0 {
			t.Fatal("account errors not reset")
		}
		finish(true, false)
	}
	for i := 0; i < 16; i++ {
		finish, retry := g.begin("client", fmt.Sprintf("user-%d", i))
		if retry != 0 {
			t.Fatal("IP blocked early")
		}
		finish(true, false)
	}
	if _, retry := g.begin("client", "fresh-account"); retry == 0 {
		t.Fatal("IP limit bypassed by changing account")
	}
	finish, retry := g.begin("unrelated-client", "unrelated-account")
	if retry != 0 {
		t.Fatal("unrelated user blocked")
	}
	finish(false, true)
}

func TestLoginGuardServiceErrorDoesNotResetFailures(t *testing.T) {
	g := newLoginGuard()
	for i := 0; i < 4; i++ {
		finish, _ := g.begin("ip", "user")
		finish(true, false)
	}
	finish, _ := g.begin("ip", "user")
	finish(false, false)
	finish, retry := g.begin("ip", "user")
	if retry != 0 {
		t.Fatal("service error counted as bad credentials")
	}
	finish(true, false)
	if _, retry := g.begin("ip", "user"); retry == 0 {
		t.Fatal("service error erased failures")
	}
}

func TestLoginGuardParallelReservations(t *testing.T) {
	g := newLoginGuard()
	var allowed atomic.Int32
	var wg sync.WaitGroup
	release := make(chan struct{})
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			finish, retry := g.begin(fmt.Sprint(i), "same-account")
			if retry > 0 {
				return
			}
			allowed.Add(1)
			<-release
			finish(true, false)
		}(i)
	}
	// Keep admitted attempts in flight until all concurrent checks have run.
	deadline := time.Now().Add(time.Second)
	for allowed.Load() < 5 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()
	if allowed.Load() != 5 {
		t.Fatalf("admitted %d attempts", allowed.Load())
	}
}

func TestLoginGuardBoundedStorage(t *testing.T) {
	g := newLoginGuard()
	now := time.Unix(1000, 0)
	g.now = func() time.Time { return now }
	for i := 0; i < maxLoginEntries/2; i++ {
		finish, retry := g.begin(fmt.Sprint(i), fmt.Sprint(i))
		if retry != 0 {
			t.Fatal("capacity reached early")
		}
		finish(true, false)
	}
	if _, retry := g.begin("new", "new"); retry == 0 {
		t.Fatal("unbounded storage")
	}
	now = now.Add(loginWindow)
	finish, retry := g.begin("new", "new")
	if retry != 0 {
		t.Fatal("expired entries not reclaimed")
	}
	finish(false, true)
	if len(g.entries) != 0 {
		t.Fatal("idle entries retained")
	}
}
