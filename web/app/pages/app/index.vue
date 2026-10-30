<script setup lang="ts">
import type { Vault, Note, Page } from '~~/shared/types/fns'
const auth = useAuthStore()
const request = useRequestFetch()
const { data: profile, error: profileError } = await useAsyncData(
  'profile',
  () => request('/api/frontend/auth/me'),
)
if (profileError.value?.statusCode === 401) await navigateTo('/login')
if (profile.value) auth.user = profile.value.user
const { data: vaults, error: vaultError } = await useAsyncData('vaults', () =>
  profile.value
    ? request<Vault[]>('/api/frontend/vaults')
    : Promise.resolve([]),
)
const selectedVault = ref(vaults.value?.[0]?.vault || '')
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
watch([vaultError, noteError], (errors) => {
  if (errors.some((error) => error?.statusCode === 401)) navigateTo('/login')
})
usePageSeo({
  title: '我的工作区 · Fast Note Sync',
  description: '查看自己的笔记库与最近笔记，管理个人知识空间。',
  robots: 'noindex, nofollow',
})
</script>
<template>
  <section class="page-heading">
    <div>
      <div class="eyebrow">YOUR WORKSPACE</div>
      <h1>{{ auth.user?.username || '我的' }}的知识空间</h1>
      <p class="muted">{{ auth.user?.email }} · 从最近一次思考继续。</p>
    </div>
    <UButton color="neutral" variant="outline" @click="auth.logout"
      >退出登录</UButton
    >
  </section>
  <p v-if="profileError || vaultError" class="error" role="alert">
    {{ profileError?.message || vaultError?.message }}
  </p>
  <div class="workspace-grid">
    <aside class="panel">
      <div class="eyebrow">MY VAULTS / {{ vaults?.length || 0 }}</div>
      <h2>笔记库</h2>
      <p v-if="!vaults?.length" class="muted">
        还没有笔记库，请在管理后台创建。
      </p>
      <button
        v-for="vault in vaults"
        :key="vault.id"
        class="vault-button"
        :class="{ active: selectedVault === vault.vault }"
        @click="selectedVault = vault.vault"
      >
        <span>▣ {{ vault.vault }}</span
        ><small>{{ vault.noteCount }} 篇</small></button
      ><a href="/webgui/" class="text-link">管理笔记库 ↗</a>
    </aside>
    <section class="panel">
      <div class="section-intro compact">
        <h2>最近笔记</h2>
        <UButton variant="ghost" color="neutral" @click="refresh()"
          >刷新 ↻</UButton
        >
      </div>
      <p v-if="status === 'pending'" role="status">正在加载笔记…</p>
      <p v-else-if="noteError" class="error" role="alert">
        {{ noteError.message }}
      </p>
      <template v-else
        ><p v-if="!notes?.list?.length" class="muted">
          这里还没有笔记。在 Obsidian 中同步笔记后即可查看。
        </p>
        <div v-for="note in notes?.list" :key="note.id" class="note-row">
          <span>▤ {{ note.path }}</span
          ><span class="muted">{{
            new Date(note.mtime).toISOString().slice(0, 10)
          }}</span>
        </div></template
      ><a href="/webgui/" class="text-link">在管理后台浏览和编辑笔记 ↗</a>
    </section>
  </div>
</template>
