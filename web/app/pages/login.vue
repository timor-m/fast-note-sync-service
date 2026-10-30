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
  <div class="login-page">
    <section class="login-intro">
      <div class="eyebrow"><span class="status-dot" /> YOUR PRIVATE WORKSPACE</div>
      <h1>欢迎回来，<br><span>继续你的知识旅程。</span></h1>
      <p>登录后继续访问自己的笔记库、最近记录与个人工作区。</p>
      <div class="login-visual" aria-hidden="true">
        <div class="login-visual-orbit orbit-one" />
        <div class="login-visual-orbit orbit-two" />
        <div class="login-visual-core"><ReaderIcon name="file" /></div>
        <span class="login-node node-one">笔记同步</span>
        <span class="login-node node-two">私有空间</span>
        <span class="login-node node-three">持续记录</span>
      </div>
      <div class="login-promise"><ReaderIcon name="lock" />你的笔记，由你掌握</div>
    </section>
    <section class="auth-panel panel login-card">
      <div class="login-card-icon"><ReaderIcon name="lock" /></div>
      <div class="eyebrow">安全登录</div>
      <h2>登录工作区</h2>
      <p class="muted">使用现有 Fast Note Sync 账号继续。</p>
      <form class="form-stack" @submit.prevent="login">
        <label for="credentials">用户名或邮箱</label>
        <UInput
          id="credentials"
          v-model="credentials"
          autocomplete="username"
          required
          size="xl"
          placeholder="输入用户名或邮箱"
        />
        <label for="password">密码</label>
        <UInput
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          size="xl"
          placeholder="输入密码"
        />
        <p v-if="message" role="alert" class="error">{{ message }}</p>
        <UButton type="submit" size="xl" block :loading="pending">登录工作区 <span aria-hidden="true">→</span></UButton>
      </form>
    </section>
  </div>
</template>
