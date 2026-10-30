<script setup lang="ts">
import { readerIconHtml } from '~/utils/reader-icons'

const props = defineProps<{ html: string }>()
const emit = defineEmits<{ articleClick: [event: MouseEvent] }>()
const element = ref<HTMLElement>()
defineExpose({ element })

// Keep scroll affordances in the shared body so workspace and share readers agree.
let resizeObserver: ResizeObserver | undefined
function syncScrollAreas() {
  for (const area of element.value?.querySelectorAll<HTMLElement>('.table-scroll,.code-block pre,.katex-block') || []) {
    const overflowing = area.scrollWidth > area.clientWidth + 1
    area.toggleAttribute('data-overflow', overflowing)
    if (overflowing) {
      const kind = area.classList.contains('table-scroll') ? '表格' : area.classList.contains('katex-block') ? '公式' : '代码'
      area.tabIndex = 0
      area.setAttribute('role', 'region')
      area.setAttribute('aria-label', `${kind}，可左右滑动或使用方向键查看`)
    } else {
      area.removeAttribute('tabindex')
      area.removeAttribute('role')
      area.removeAttribute('aria-label')
    }
  }
}
function observeScrollAreas() {
  resizeObserver?.disconnect()
  if (!resizeObserver || !element.value) return
  resizeObserver.observe(element.value)
  for (const area of element.value.querySelectorAll('.table-scroll,.code-block pre,.katex-block')) {
    resizeObserver.observe(area)
    if (area.firstElementChild) resizeObserver.observe(area.firstElementChild)
  }
  syncScrollAreas()
}
onMounted(() => {
  resizeObserver = new ResizeObserver(syncScrollAreas)
  observeScrollAreas()
})
watch(() => props.html, observeScrollAreas, { flush: 'post' })
onBeforeUnmount(() => resizeObserver?.disconnect())

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
