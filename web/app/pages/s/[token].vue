<script setup lang="ts">
import type { Note } from '~~/shared/types/fns'
definePageMeta({ layout: 'share' })
const route = useRoute()
const resourceId = computed(() => route.params.id || route.query.id)
const password = ref('')
const showPassword = ref(false)
const request = useRequestFetch()
const requestOrigin = import.meta.server ? useRequestURL().origin : undefined
const { data: initialShare } = await useAsyncData(
  () => `share-content-${route.params.token}-${resourceId.value}`,
  async () => {
    if (!resourceId.value)
      return { note: null, message: '链接缺少资源 ID，请使用完整链接（含 ?id=资源编号）。原有分享链接仍可直接访问。' }
    try {
      const note = await request<Note>('/api/frontend/shares/note', {
        method: 'POST',
        ...(requestOrigin ? { headers: { origin: requestOrigin } } : {}),
        body: { token: String(route.params.token), id: resourceId.value, password: '' },
      })
      return { note, message: '' }
    } catch (error: any) {
      const message = error.data?.message || '无法加载分享，请稍后重试'
      return { note: null, message: message === '请输入分享密码' ? '' : message }
    }
  },
)
const note = ref<Note | null>(initialShare.value?.note || null)
const pending = ref(false)
const message = ref(initialShare.value?.message || '')
const { data: preview } = await useAsyncData(
  () => `share-meta-${route.params.token}-${resourceId.value}`,
  () => resourceId.value
    ? request<{ title: string; description: string }>('/api/frontend/shares/meta', {
        query: { token: String(route.params.token), id: resourceId.value },
      }).catch(() => null)
    : Promise.resolve(null),
)
async function loadNote(refresh = false) {
  if (pending.value) return
  pending.value = true
  message.value = ''
  if (!refresh) note.value = null
  try {
    note.value = await request<Note>('/api/frontend/shares/note', {
      method: 'POST',
      body: {
        token: String(route.params.token),
        id: resourceId.value,
        password: password.value,
      },
    })
  } catch (error: any) {
    note.value = null
    message.value = error.data?.message || '无法加载分享，请稍后重试'
  } finally {
    pending.value = false
  }
}
watch(initialShare, (value) => {
  note.value = value?.note || null
  message.value = value?.message || ''
})
usePageSeo({
  title: () => {
    const title = preview.value?.title || note.value?.path.split('/').pop()?.replace(/\.md$/i, '')
    return title || '笔记分享'
  },
  // Protected shares never expose their body in metadata, even after unlocking.
  description: () => preview.value?.description || '通过 Fast Note Sync 打开受控分享的笔记；如有访问密码，请向分享者获取。',
  type: 'article',
})
</script>
<template>
  <div v-if="!note" class="share-locked-page">
    <header class="reader-header">
      <div class="reader-header-inner">
        <div class="reader-document-title">
          <span class="reader-file-icon"><ReaderIcon name="lock" /></span>
          <div>
            <h1>受保护的分享</h1>
            <div class="reader-document-meta"><span>Fast Note Sync</span></div>
          </div>
        </div>
      </div>
    </header>
    <main class="share-locked-main">
      <section class="auth-panel panel share-lock-card">
        <div class="share-lock-badge"><span />加密分享</div>
        <div class="share-lock-symbol"><ReaderIcon name="lock" /></div>
        <h1>这份内容已加锁</h1>
        <p class="muted">输入分享密码后即可继续阅读。</p>
        <form class="form-stack" @submit.prevent="loadNote()">
          <label for="share-password">分享密码</label>
          <UInput
            id="share-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="off"
            size="xl"
            placeholder="请输入访问密码"
          >
            <template #trailing>
              <button
                class="password-visibility-button"
                type="button"
                :aria-label="showPassword ? '隐藏密码' : '查看密码'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <ReaderIcon :name="showPassword ? 'eye-off' : 'eye'" />
              </button>
            </template>
          </UInput>
          <p v-if="message" class="error" role="alert">{{ message }}</p>
          <p v-if="pending" role="status">正在验证并加载笔记…</p>
          <UButton
            type="submit"
            size="xl"
            block
            :loading="pending"
            :disabled="!resourceId"
            >解锁并阅读</UButton
          >
        </form>
      </section>
    </main>
  </div>
  <SharedArticle v-else :content="note.content || ''" :path="note.path" :mtime="note.mtime" :version="note.version" :view-count="note.viewCount" :token="String(route.params.token)" :password="password" :loading="pending" @refresh="loadNote(true)" />
</template>
