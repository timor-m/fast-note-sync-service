<script setup lang="ts">
const auth = useAuthStore()
const credentials = ref('')
const password = ref('')
const pending = ref(false)
const message = ref('')
async function login() {
  pending.value = true
  message.value = ''
  try {
    const result = await $fetch('/api/frontend/auth/login', {
      method: 'POST',
      body: { credentials: credentials.value, password: password.value },
    })
    auth.user = result.user
    password.value = ''
    await navigateTo('/app')
  } catch (error: any) {
    message.value = error.data?.message || '登录失败，请稍后重试'
  } finally {
    pending.value = false
  }
}
usePageSeo({ title: '登录 · Fast Note Sync', description: '登录 Fast Note Sync，访问自己的笔记库与工作台。' })
</script>
<template>
  <section class="auth-panel panel">
    <div class="eyebrow">WELCOME BACK</div>
    <h1>回到你的知识空间</h1>
    <p class="muted">使用现有 Fast Note Sync 账号登录。</p>
    <form class="form-stack" @submit.prevent="login">
      <label for="credentials">用户名或邮箱</label
      ><UInput
        id="credentials"
        v-model="credentials"
        autocomplete="username"
        required
        size="xl"
        placeholder="输入用户名或邮箱"
      /><label for="password">密码</label
      ><UInput
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        size="xl"
        placeholder="输入密码"
      />
      <p v-if="message" role="alert" class="error">{{ message }}</p>
      <UButton type="submit" size="xl" block :loading="pending"
        >登录工作区 →</UButton
      >
    </form>
    <p class="subtle">
      需要注册或管理服务？<a href="/webgui/">进入原版后台 ↗</a>
    </p>
  </section>
</template>
