package api_router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/haierkeys/fast-note-sync-service/internal/app"
	"github.com/haierkeys/fast-note-sync-service/internal/domain"
	"github.com/haierkeys/fast-note-sync-service/internal/dto"
	svcmocks "github.com/haierkeys/fast-note-sync-service/internal/service/mocks"
	pkgapp "github.com/haierkeys/fast-note-sync-service/pkg/app"
	"github.com/haierkeys/fast-note-sync-service/pkg/code"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func newShareTestContext(method, url, body string, uid int64) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, url, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, url, nil)
	}

	c, _ := gin.CreateTestContext(w)
	c.Request = req
	if uid > 0 {
		c.Set("user_token", &pkgapp.UserEntity{UID: uid})
	}
	return c, w
}

type mockTokenManager struct {
	mock.Mock
}

func (m *mockTokenManager) Generate(uid int64, nickname, ip string, tokenID int64, nonce string) (string, error) {
	args := m.Called(uid, nickname, ip, tokenID, nonce)
	return args.String(0), args.Error(1)
}
func (m *mockTokenManager) Parse(token string) (*pkgapp.UserEntity, error) {
	args := m.Called(token)
	return args.Get(0).(*pkgapp.UserEntity), args.Error(1)
}
func (m *mockTokenManager) ShareGenerate(shareID int64, uid int64, resources map[string][]string) (string, error) {
	args := m.Called(shareID, uid, resources)
	return args.String(0), args.Error(1)
}
func (m *mockTokenManager) ShareParse(token string) (*pkgapp.ShareEntity, error) {
	args := m.Called(token)
	return args.Get(0).(*pkgapp.ShareEntity), args.Error(1)
}
func (m *mockTokenManager) Validate(token string) error {
	return m.Called(token).Error(0)
}
func (m *mockTokenManager) GetSecretKey() string {
	return m.Called().String(0)
}

func newTestShareHandler(shareSvc *svcmocks.MockShareService, tm *mockTokenManager) *ShareHandler {
	testApp := app.NewTestApp(&app.Services{
		ShareService: shareSvc,
	})
	if tm != nil {
		testApp.TokenManager = tm
	}
	wss := pkgapp.NewWebsocketServer(pkgapp.WSConfig{}, testApp)
	return NewShareHandler(testApp, wss)
}

func TestShareHandler_Create_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)

	mockData := &dto.ShareCreateResponse{
		ID:    1,
		Token: "share_token",
	}

	mockSvc.On("ShareGenerate", mock.Anything, int64(1), "main", "test.md", "hash_123", "", int64(0)).
		Return(mockData, nil)

	handler := newTestShareHandler(mockSvc, nil)
	body := `{"vault":"main", "path":"test.md", "pathHash":"hash_123", "password":""}`
	c, w := newShareTestContext("POST", "/api/share", body, 1)

	handler.Create(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
}

func TestShareHandler_NoteGet_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)

	mockData := &dto.NoteDTO{
		ID:   1,
		Path: "test.md",
	}

	mockSvc.On("GetSharedNote", mock.Anything, "token_123", int64(1), "").
		Return(mockData, nil)

	handler := newTestShareHandler(mockSvc, nil)
	c, w := newShareTestContext("GET", "/api/share/note?id=1", "", 1)
	c.Set("share_token", "token_123")

	handler.NoteGet(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
}

func TestShareHandler_ViewCountingAndPreview(t *testing.T) {
	for _, preview := range []bool{false, true} {
		mockSvc := new(svcmocks.MockShareService)
		note := &dto.NoteDTO{ID: 1, Path: "folder/分享.md", Content: "---\nprivate: frontmatter\n---\n# 公开内容\n![img](https://example.com/secret-token)\n```\ncode\n```"}
		mockSvc.On("GetSharedNote", mock.Anything, "token", int64(1), "").Return(note, nil).Once()
		if !preview {
			mockSvc.On("RecordView", int64(7), int64(9)).Return().Once()
		}
		c, w := newShareTestContext("GET", "/api/share/note?id=1", "", 0)
		c.Set("share_token", "token")
		c.Set("share_entity", &pkgapp.ShareEntity{UID: 7, SID: 9})
		h := newTestShareHandler(mockSvc, nil)
		if preview {
			h.NoteMetadata(c)
			assert.Contains(t, w.Body.String(), `"title":"分享"`)
			assert.NotContains(t, w.Body.String(), "frontmatter")
			assert.NotContains(t, w.Body.String(), "secret-token")
			assert.NotContains(t, w.Body.String(), `"content"`)
			mockSvc.AssertNotCalled(t, "RecordView", mock.Anything, mock.Anything)
		} else {
			h.NoteGet(c)
		}
		assert.Equal(t, "private, no-store", w.Header().Get("Cache-Control"))
		mockSvc.AssertExpectations(t)
	}
}

func TestShareHandler_FailedNoteDoesNotCount(t *testing.T) {
	m := new(svcmocks.MockShareService)
	m.On("GetSharedNote", mock.Anything, "token", int64(1), "").Return((*dto.NoteDTO)(nil), code.ErrorNoteNotFound).Once()
	c, _ := newShareTestContext("GET", "/api/share/note?id=1", "", 0)
	c.Set("share_token", "token")
	c.Set("share_entity", &pkgapp.ShareEntity{UID: 7, SID: 9})
	newTestShareHandler(m, nil).NoteGet(c)
	m.AssertNotCalled(t, "RecordView", mock.Anything, mock.Anything)
	m.AssertExpectations(t)
}

func TestShareHandler_Query_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)
	mockTM := new(mockTokenManager)

	shareData := &domain.UserShare{
		ID: 1,
		Resources: map[string][]string{
			"note": {"1"},
		},
	}

	mockSvc.On("GetShareByPath", mock.Anything, int64(1), "main", "hash_123").
		Return(shareData, nil)

	mockTM.On("ShareGenerate", int64(1), int64(1), map[string][]string{"note": {"1"}}).
		Return("generated_token_123", nil)

	handler := newTestShareHandler(mockSvc, mockTM)
	c, w := newShareTestContext("GET", "/api/share?vault=main&path=test.md&pathHash=hash_123", "", 1)

	handler.Query(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
	mockTM.AssertExpectations(t)
}

func TestShareHandler_Cancel_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)

	mockSvc.On("StopShare", mock.Anything, int64(1), int64(1)).Return(nil)

	handler := newTestShareHandler(mockSvc, nil)
	body := `{"id":1, "vault":"main"}`
	c, w := newShareTestContext("DELETE", "/api/share", body, 1)

	handler.Cancel(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
}

func TestShareHandler_UpdatePassword_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)

	mockSvc.On("UpdateSharePassword", mock.Anything, int64(1), "main", "test.md", "hash_123", "new_pwd", int64(0)).Return(nil)

	handler := newTestShareHandler(mockSvc, nil)
	body := `{"vault":"main", "path":"test.md", "pathHash":"hash_123", "password":"new_pwd"}`
	c, w := newShareTestContext("POST", "/api/share/password", body, 1)

	handler.UpdatePassword(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
}

func TestShareHandler_List_Success(t *testing.T) {
	mockSvc := new(svcmocks.MockShareService)

	mockData := []*dto.ShareListItem{
		{ID: 1, VaultName: "main", NotePath: "test.md"},
	}

	mockSvc.On("ListShares", mock.Anything, int64(1), "created_at", "desc", mock.AnythingOfType("*app.Pager")).
		Return(mockData, 1, nil)

	handler := newTestShareHandler(mockSvc, nil)
	c, w := newShareTestContext("GET", "/api/shares?sort_by=created_at&sort_order=desc", "", 1)

	handler.List(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assertResponseCode(t, w, code.Success.Code())
	mockSvc.AssertExpectations(t)
}
