// Package service implements the business logic layer.
// Package service 实现业务逻辑层。
package service

import (
	"errors"
	"testing"

	"github.com/haierkeys/fast-note-sync-service/internal/domain"
	domainmocks "github.com/haierkeys/fast-note-sync-service/internal/domain/mocks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
)

func TestShareStatsRetryKeepsConcurrentViews(t *testing.T) {
	repo := new(domainmocks.MockUserShareRepository)
	s := &shareService{repo: repo, logger: zap.NewNop(), statsBuffer: make(map[int64]*aggStats)}
	s.RecordView(7, 9)
	s.RecordView(7, 9)
	repo.On("UpdateViewStats", mock.Anything, int64(7), int64(9), int64(2), mock.Anything).
		Run(func(_ mock.Arguments) { s.RecordView(7, 9) }).Return(errors.New("temporary database error")).Once()
	s.flush()
	assert.Equal(t, int64(3), s.statsBuffer[9].viewCount)
	repo.On("UpdateViewStats", mock.Anything, int64(7), int64(9), int64(3), mock.Anything).Return(nil).Once()
	s.flush()
	assert.Empty(t, s.statsBuffer)
	repo.AssertExpectations(t)
}

// TestExtractSharedNoteFileRefs verifies that all image/file refs in markdown content are extracted.
// TestExtractSharedNoteFileRefs 验证 markdown 内容中所有图片/文件引用都被正确提取。
func TestExtractSharedNoteFileRefs(t *testing.T) {
	content := `
![[assets/photo.png|240]]
![inline](../images/demo.jpg "title")
<img src="./img/html.png" alt="demo">
`
	refs := extractSharedNoteFileRefs(content)

	expected := map[string]struct{}{
		"assets/photo.png":   {},
		"../images/demo.jpg": {},
		"./img/html.png":     {},
	}

	assert.Len(t, refs, len(expected), "should extract exactly %d file refs", len(expected))

	for _, ref := range refs {
		_, ok := expected[ref]
		assert.True(t, ok, "unexpected ref extracted: %s", ref)
	}
}

// TestBuildSharePathCandidates verifies that relative image paths are resolved correctly.
// TestBuildSharePathCandidates 验证相对图片路径被正确解析为候选路径。
func TestBuildSharePathCandidates(t *testing.T) {
	candidates := buildSharePathCandidates("notes/daily/today.md", "../images/demo.png")
	expected := []string{"notes/images/demo.png"}

	assert.Equal(t, expected, candidates, "resolved path candidates should match")
}

// TestRewriteMarkdownImageLinks verifies that markdown image links are rewritten to share URLs.
// TestRewriteMarkdownImageLinks 验证 markdown 图片链接被重写为分享 URL。
func TestRewriteMarkdownImageLinks(t *testing.T) {
	content := `![demo](./images/demo.png "title")`
	fileRefs := map[string]*domain.File{
		"./images/demo.png": {ID: 42},
	}

	rewritten := rewriteMarkdownImageLinks(content, fileRefs, "share-token", "pwd")
	expected := `![demo](/api/share/file?id=42&share_token=share-token&password=pwd "title")`

	assert.Equal(t, expected, rewritten, "image links should be rewritten to share API URLs")
}
