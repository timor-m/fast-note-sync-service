package task

import (
	"context"
	"github.com/haierkeys/fast-note-sync-service/internal/app"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDockerVersionsUseSemanticTagsAndRespectChannel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[{"name":"latest"},{"name":"1.0.0"},{"name":"1.10.0"},{"name":"1.2.0"},{"name":"2.0.0-beta.1"},{"name":"build-amd64"}]}`))
	}))
	defer server.Close()
	a := app.NewTestApp(nil)
	a.Config().App.PullReleaseChannel = "stable"
	task := &CheckVersionTask{app: a}
	releases, err := task.fetchDockerHubReleasesCtx(context.Background(), server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(releases) != 3 || releases[0].Version != "v1.10.0" {
		t.Fatalf("unexpected stable versions: %+v", releases)
	}
	link, _, _ := buildLinks(releases, true, true)
	if link != "https://hub.docker.com/r/timorm/fast-note-sync-service/tags?name=1.10.0" {
		t.Fatal(link)
	}
	a.Config().App.PullReleaseChannel = "alpha"
	releases, err = task.fetchDockerHubReleasesCtx(context.Background(), server.URL)
	if err != nil || len(releases) != 4 || releases[0].Version != "v2.0.0-beta.1" {
		t.Fatalf("unexpected alpha versions: %+v, %v", releases, err)
	}
}

func TestDockerVersionFailureDoesNotFallBackToUpstream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTooManyRequests) }))
	defer server.Close()
	_, err := (&CheckVersionTask{app: app.NewTestApp(nil)}).fetchDockerHubReleasesCtx(context.Background(), server.URL)
	if err == nil {
		t.Fatal("expected Docker Hub error")
	}
}
