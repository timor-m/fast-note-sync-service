<script setup lang="ts">
import { requestErrorMessage } from '~/utils/request-error'
import type { Vault, Note, Page } from '~~/shared/types/fns'
const auth = useAuthStore()
const request = useRequestFetch()
const { data: profile, error: profileError } = await useAsyncData(
  'profile',
  () => request('/api/frontend/auth/me'),
)
if (profileError.value?.statusCode === 401) { auth.user = null; await navigateTo('/login') }
if (profile.value) auth.user = profile.value.user
const { data: vaults, error: vaultError } = await useAsyncData('vaults', () =>
  profile.value
    ? request<Vault[]>('/api/frontend/vaults')
    : Promise.resolve([]),
)
const selectedVault = ref(vaults.value?.[0]?.vault || '')
const totalNotes = computed(() => vaults.value?.reduce((total, vault) => total + vault.noteCount, 0) || 0)
const totalFiles = computed(() => vaults.value?.reduce((total, vault) => total + vault.fileCount, 0) || 0)
const {
  data: notes,
  status,
  error: noteError,
  refresh,
} = await useAsyncData(
  'recent-notes',
  () =>
    selectedVault.value
      ? request<Page<Note>>('/api/frontend/notes', {
          query: { vault: selectedVault.value, pageSize: 8 },
        })
      : Promise.resolve(null),
  { watch: [selectedVault] },
)
watch([profileError, vaultError, noteError], (errors) => {
  if (errors.some((error) => error?.statusCode === 401)) { auth.user = null; navigateTo('/login') }
})
usePageSeo({
  title: '我的工作区 · Fast Note Sync',
  description: '查看自己的笔记库与最近笔记，管理个人知识空间。',
  robots: 'noindex, nofollow',
})
</script>
<template>
  <section class="page-heading workspace-heading">
    <div>
      <div class="eyebrow"><span class="status-dot" /> YOUR WORKSPACE</div>
      <h1>你好，{{ auth.user?.username || '朋友' }}</h1>
      <p class="muted">从最近一次思考继续，今天也为知识留一点空间。</p>
    </div>
    <UButton class="workspace-logout" color="neutral" variant="outline" @click="auth.logout">退出登录</UButton>
  </section>
  <p v-if="profileError || vaultError" class="error" role="alert">
    {{ requestErrorMessage(profileError || vaultError, '工作区加载失败，请稍后重试') }}
  </p>
  <section class="workspace-overview" aria-label="工作区概览">
    <article class="workspace-stat"><span class="workspace-stat-icon"><ReaderIcon name="file" /></span><div><strong>{{ vaults?.length || 0 }}</strong><span>个笔记库</span></div></article>
    <article class="workspace-stat"><span class="workspace-stat-icon"><ReaderIcon name="lines" /></span><div><strong>{{ totalNotes }}</strong><span>篇笔记</span></div></article>
    <article class="workspace-stat"><span class="workspace-stat-icon"><ReaderIcon name="copy" /></span><div><strong>{{ totalFiles }}</strong><span>个附件</span></div></article>
  </section>
  <div class="workspace-grid">
    <aside class="panel workspace-vaults">
      <div class="workspace-panel-heading"><div><div class="eyebrow">YOUR LIBRARY</div><h2>笔记库</h2></div><span class="workspace-count">{{ vaults?.length || 0 }}</span></div>
      <p v-if="!vaults?.length" class="muted workspace-empty">还没有笔记库，可以先在管理工具中创建。</p>
      <button
        v-for="vault in vaults"
        :key="vault.id"
        class="vault-button"
        :class="{ active: selectedVault === vault.vault }"
        @click="selectedVault = vault.vault"
      >
        <span class="vault-name"><ReaderIcon name="file" /><span>{{ vault.vault }}</span></span><small>{{ vault.noteCount }} 篇</small>
      </button>
      <a href="/webgui/" class="text-link workspace-manage-link">打开笔记管理工具 <span aria-hidden="true">↗</span></a>
    </aside>
    <section class="panel workspace-recent">
      <div class="workspace-panel-heading recent-heading">
        <div><div class="eyebrow">RECENTLY UPDATED</div><h2>最近笔记</h2><p class="muted">{{ selectedVault || '选择一个笔记库' }}</p></div>
        <UButton variant="soft" color="neutral" :loading="status === 'pending'" aria-label="刷新笔记" @click="refresh()"><ReaderIcon name="refresh" /></UButton>
      </div>
      <p v-if="status === 'pending'" role="status">正在加载笔记…</p>
      <p v-else-if="noteError" class="error" role="alert">
        {{ requestErrorMessage(noteError, '笔记列表加载失败，请稍后重试') }}
      </p>
      <div v-else-if="!notes?.list?.length" class="workspace-empty workspace-empty-recent"><span class="workspace-empty-icon"><ReaderIcon name="file" /></span><strong>这里还没有笔记</strong><p>在 Obsidian 中同步笔记后，最近更新的内容会显示在这里。</p></div>
      <div v-else class="workspace-note-list">
        <div v-for="note in notes.list" :key="note.id" class="note-row">
          <NuxtLink class="note-title" :to="{ path: '/app/note', query: { vault: selectedVault, path: note.path } }"><ReaderIcon name="file" /><span>{{ note.path }}</span><span class="note-open-indicator">查看 →</span></NuxtLink>
          <time class="muted">{{ new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(note.mtime)) }}</time>
        </div>
      </div>
      <a href="/webgui/" class="text-link workspace-manage-link">前往管理工具浏览和编辑 <span aria-hidden="true">↗</span></a>
    </section>
  </div>
</template>
