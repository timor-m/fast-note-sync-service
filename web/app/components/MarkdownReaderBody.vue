<script setup lang="ts">
import { readerIconHtml } from '~/utils/reader-icons'

defineProps<{ html: string }>()
const emit = defineEmits<{ articleClick: [event: MouseEvent] }>()
const element = ref<HTMLElement>()
defineExpose({ element })

async function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const toggle = target.closest<HTMLButtonElement>('button[data-toggle-lines]')
  if (toggle) {
    const enabled = toggle.closest('.code-block')?.classList.toggle('show-line-numbers') || false
    toggle.setAttribute('aria-pressed', String(enabled))
    toggle.setAttribute('aria-label', enabled ? '隐藏行号' : '显示行号')
    return
  }

  const copy = target.closest<HTMLButtonElement>('button[data-copy-code]')
  const code = copy?.closest('.code-block')?.querySelector('code')?.textContent
  if (copy && code !== undefined) {
    try {
      await navigator.clipboard.writeText(code)
      copy.innerHTML = readerIconHtml('check')
      copy.setAttribute('aria-label', '已复制')
      window.setTimeout(() => {
        if (!copy.isConnected) return
        copy.innerHTML = readerIconHtml('copy')
        copy.setAttribute('aria-label', '复制代码')
      }, 1800)
    } catch {
      copy.setAttribute('aria-label', '复制失败，请选中代码复制')
    }
    return
  }

  emit('articleClick', event)
}
</script>

<template>
  <div ref="element" class="markdown-body" @click="onClick" v-html="html" />
</template>
