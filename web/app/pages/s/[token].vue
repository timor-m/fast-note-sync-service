<script setup lang="ts">
import type { Note } from '~~/shared/types/fns'
const route = useRoute()
const password = ref('')
const note = ref<Note | null>(null)
const pending = ref(false)
const message = ref('')
const request = useRequestFetch()
const { data: preview } = await useAsyncData(
  () => `share-meta-${route.params.token}-${route.query.id}`,
  () => route.query.id
    ? request<{ title: string; description: string }>('/api/frontend/shares/meta', {
        query: { token: String(route.params.token), id: route.query.id },
      }).catch(() => null)
    : Promise.resolve(null),
)
async function loadNote() {
  pending.value = true
  message.value = ''
  note.value = null
  try {
    note.value = await $fetch<Note>('/api/frontend/shares/note', {
      method: 'POST',
      body: {
        token: String(route.params.token),
        id: route.query.id,
        password: password.value,
      },
    })
  } catch (error: any) {
    message.value = error.data?.message || '无法加载分享，请稍后重试'
  } finally {
    pending.value = false
  }
}
onMounted(() => {
  if (route.query.id) loadNote()
  else
    message.value =
      '链接缺少资源 ID，请使用完整链接（含 ?id=资源编号）。原有分享链接仍可直接访问。'
})
usePageSeo({
  title: () => {
    const title = preview.value?.title || note.value?.path.split('/').pop()?.replace(/\.md$/i, '')
    return title ? `${title} · Fast Note Sync` : '笔记分享 · Fast Note Sync'
  },
  // Protected shares never expose their body in metadata, even after unlocking.
  description: () => preview.value?.description || '通过 Fast Note Sync 打开受控分享的笔记；如有访问密码，请向分享者获取。',
  type: 'article',
})
</script>
<template>
  <section v-if="!note" class="auth-panel panel">
    <div class="eyebrow">A NOTE, SHARED WITH YOU</div>
    <h1>打开一份分享的知识</h1>
    <p class="muted">如分享受密码保护，请输入访问密码。</p>
    <form class="form-stack" @submit.prevent="loadNote">
      <label for="share-password">分享密码</label
      ><UInput
        id="share-password"
        v-model="password"
        type="password"
        autocomplete="off"
        size="xl"
        placeholder="无密码的分享可直接打开"
      />
      <p v-if="message" class="error" role="alert">{{ message }}</p>
      <p v-if="pending" role="status">正在验证并加载笔记…</p>
      <UButton
        type="submit"
        size="xl"
        block
        :loading="pending"
        :disabled="!route.query.id"
        >打开分享 →</UButton
      >
    </form>
    <p class="subtle">访问权限由原 Fast Note Sync 分享服务校验。</p>
  </section>
  <article v-else class="panel shared-note">
    <div class="eyebrow">SHARED NOTE / READ ONLY</div>
    <h1>{{ note.path }}</h1>
    <p class="subtle">基础文本预览 · Markdown 排版将在后续阶段接入</p>
    <pre>{{ note.content }}</pre>
  </article>
</template>
