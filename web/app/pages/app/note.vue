<script setup lang="ts">
import { requestErrorMessage } from '~/utils/request-error'
import type { Note } from '~~/shared/types/fns'
import { renderShareMarkdown } from '~/utils/share-markdown'

const route = useRoute()
const request = useRequestFetch()
const vault = computed(() => typeof route.query.vault === 'string' ? route.query.vault : '')
const path = computed(() => typeof route.query.path === 'string' ? route.query.path : '')
const noteKey = computed(() => `workspace-note-${vault.value}-${path.value}`)
const { data: note, error, status } = await useAsyncData(
  noteKey,
  () => vault.value && path.value
    ? request<Note>('/api/frontend/note', { query: { vault: vault.value, path: path.value } })
    : Promise.reject(createError({ statusCode: 400, message: '笔记链接缺少笔记库或路径' })),
  { watch: [vault, path] },
)
if (error.value?.statusCode === 401)
  await navigateTo('/login')
const title = computed(() => path.value.split('/').pop()?.replace(/\.md$/i, '') || '笔记')
const rendered = computed(() => renderShareMarkdown(note.value?.content || ''))
usePageSeo({ title: () => `${title.value} · 我的工作区`, description: () => `在我的工作区阅读笔记：${path.value}`, robots: 'noindex, nofollow' })

</script>

<template>
  <section class="workspace-note-view">
    <div class="workspace-note-toolbar">
      <NuxtLink to="/app" class="workspace-back-link"><span aria-hidden="true">←</span> 返回工作区</NuxtLink>
      <a href="/webgui/" class="text-link">在管理工具中编辑 <span aria-hidden="true">↗</span></a>
    </div>
    <header class="workspace-note-heading">
      <div class="eyebrow">{{ vault }} <span aria-hidden="true">/</span> NOTE</div>
      <h1>{{ title }}</h1>
      <p>{{ path }}</p>
    </header>
    <p v-if="status === 'pending'" class="workspace-note-state" role="status">正在打开笔记…</p>
    <section v-else-if="error" class="panel workspace-note-state error" role="alert">{{ requestErrorMessage(error, '无法加载这篇笔记。') }}</section>
    <article v-else class="article-paper workspace-note-paper">
      <MarkdownReaderBody :html="rendered.html" />
      <p v-if="!note?.content" class="muted">这篇笔记暂时没有正文内容。</p>
    </article>
  </section>
</template>
