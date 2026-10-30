<script setup lang="ts">
import { sharePalettes } from '~/composables/useSharePreferences'
const preferences = useSharePreferences()
const preferenceCookie = useCookie<Record<string, unknown> | null>('fns-share-preferences', {
  default: () => null,
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
  path: '/',
})
useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }] })
const systemDark = ref(false)
const dark = computed(() => preferences.value.theme === 'dark' || (preferences.value.theme === 'system' && systemDark.value))
let media: MediaQueryList | undefined
function syncSystem() { systemDark.value = media?.matches || false }
function applyPreferences(saved: Record<string, unknown>) {
  preferences.value = {
    wide: typeof saved.wide === 'boolean' ? saved.wide : true,
    contents: typeof saved.contents === 'boolean' ? saved.contents : true,
    scheme: sharePalettes.some(p => p.value === saved.scheme) ? String(saved.scheme) : 'default',
    theme: ['light', 'dark', 'system'].includes(String(saved.theme)) ? String(saved.theme) : 'system',
  }
}
if (preferenceCookie.value) applyPreferences(preferenceCookie.value)
useHead({
  htmlAttrs: {
    'data-share-theme': () => dark.value ? 'dark' : 'light',
    'data-share-scheme': () => preferences.value.scheme,
  },
})
onMounted(() => {
  media = matchMedia('(prefers-color-scheme: dark)')
  syncSystem()
  media.addEventListener('change', syncSystem)
  if (!preferenceCookie.value) {
    try {
      const stored = localStorage.getItem('fns-share-preferences')
      if (stored) applyPreferences(JSON.parse(stored))
    } catch { /* Reading preferences is optional when browser storage is unavailable. */ }
    preferenceCookie.value = { ...preferences.value }
  }
})
watch(preferences, (value) => {
  preferenceCookie.value = { ...value }
  try { localStorage.setItem('fns-share-preferences', JSON.stringify(value)) } catch { /* Private browsing can disable storage. */ }
}, { deep: true })
onBeforeUnmount(() => media?.removeEventListener('change', syncSystem))
</script>
<template>
  <div class="share-shell" :class="{ dark }" :data-share-scheme="preferences.scheme" :data-share-theme="dark ? 'dark' : 'light'">
    <slot />
  </div>
</template>
