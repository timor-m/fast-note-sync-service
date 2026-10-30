<script setup lang="ts">
const colorMode = useColorMode()
</script>
<template>
  <div class="site-shell">
    <header class="site-header wrap">
      <NuxtLink to="/" class="brand" aria-label="Fast Note Sync 首页"
        ><span class="brand-mark">F</span
        ><span>Fast Note <strong>Sync</strong></span></NuxtLink
      >
      <nav aria-label="主导航">
        <UButton
          color="neutral"
          variant="ghost"
          aria-label="切换明暗主题"
          @click="
            colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
          "
          >◐</UButton
        ><UButton to="/app" color="primary">我的工作区</UButton>
      </nav>
    </header>
    <main class="wrap"><slot /></main>
    <footer class="site-footer wrap">
      <span>Fast Note Sync · 记录，连接，分享。</span
      ><span>Built for your knowledge.</span>
    </footer>
  </div>
</template>
