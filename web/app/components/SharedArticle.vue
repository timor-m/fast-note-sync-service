<script setup lang="ts">
import { renderShareMarkdown, resolveArticleAnchor } from '~/utils/share-markdown'
import { enhanceShareAudio } from '~/utils/share-audio'
import { sharePalettes } from '~/composables/useSharePreferences'
const props = defineProps<{ content: string; path: string; mtime: number; version?: number; viewCount?: number; token: string; password: string; loading: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const preferences = useSharePreferences()
const diagramViewer = ref<{ open: (svg: SVGSVGElement) => Promise<void>; update: (svg: SVGSVGElement) => void }>()
const outlineHeadings = computed(() => rendered.value.headings.filter(heading => heading.level <= 3))
const diagramId = useId().replace(/[^a-zA-Z0-9]/g, '')
let diagramGeneration = 0
let diagramTheme: MediaQueryList | undefined
let touchQuery: MediaQueryList | undefined
const systemDark = ref(false)
const isDark = computed(() => preferences.value.theme === 'dark' || (preferences.value.theme === 'system' && systemDark.value))
function onSystemTheme() { systemDark.value = diagramTheme?.matches || false; void renderDiagrams() }
function toggleTheme() { preferences.value.theme = isDark.value ? 'light' : 'dark' }
async function renderDiagrams() {
  if (!rendered.value.diagrams.length || !article.value?.element || disposed) return
  const generation = ++diagramGeneration
  const { default: mermaid } = await import('mermaid')
  if (disposed || generation !== diagramGeneration) return
  const dark = isDark.value
  // Match the original reader: Mermaid owns its light/dark diagram colors.
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', maxTextSize: 50000, maxEdges: 500, flowchart: { htmlLabels: false } })
  for (const element of article.value.element.querySelectorAll<HTMLElement>('[data-diagram-index]')) {
    const index = Number(element.dataset.diagramIndex)
    const source = rendered.value.diagrams[index]
    if (source === undefined) continue
    try {
      const { svg } = await mermaid.render(`reader-${diagramId}-${generation}-${index}`, source, element)
      if (disposed || generation !== diagramGeneration || !element.isConnected) return
      element.innerHTML = svg
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'diagram-expand'
      button.setAttribute('aria-label', '全屏查看图表')
      button.innerHTML = readerIconHtml('expand')
      element.append(button)
      diagramViewer.value?.update(element.querySelector('svg')!)
    } catch {
      if (disposed || generation !== diagramGeneration) return
      const pre = document.createElement('pre')
      pre.textContent = source
      const message = document.createElement('p')
      message.textContent = '图表语法暂不支持，已显示源码。'
      element.replaceChildren(message, pre)
    }
  }
}
const title = computed(() => props.path.split('/').pop()?.replace(/\.md$/i, '') || '分享笔记')
const modified = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(props.mtime)))
function choose(key: 'theme' | 'scheme', value: string) {
  preferences.value[key] = value
  closeReaderMenus()
}
const files = ref<Record<string, string>>({})
const rendered = computed(() => renderShareMarkdown(props.content, files.value))
const contentsDialog = ref<HTMLDialogElement>()
let contentsOpener: HTMLElement | null = null
let savedContentsOverflow = ''
let contentsLocked = false
function closeReaderMenus() {
  document.querySelectorAll('.reader-menu[open], .reader-palette-submenu[open]').forEach(menu => menu.removeAttribute('open'))
}
function refreshFromMenu() { closeReaderMenus(); emit('refresh') }
function openContents() {
  if (!contentsDialog.value || contentsDialog.value.open) return
  contentsOpener = document.querySelector<HTMLElement>('.reader-more > summary')
  closeReaderMenus()
  contentsLocked = true
  savedContentsOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  contentsDialog.value.showModal()
  void nextTick(() => {
    const link = contentsDialog.value?.querySelector<HTMLElement>('nav a.active')
    const nav = link?.parentElement
    if (link && nav) nav.scrollTop = Math.max(0, link.offsetTop - nav.offsetTop - nav.clientHeight / 3)
  })
}
function closeContents() { contentsDialog.value?.close() }
function afterContentsClose() {
  if (!contentsLocked) return
  contentsLocked = false
  document.body.style.overflow = savedContentsOverflow
  contentsOpener?.focus({ preventScroll: true })
}
function onContentsClick(event: MouseEvent) {
  if (event.target !== contentsDialog.value) return
  const bounds = contentsDialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeContents()
}
function onContentsKey(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = contentsDialog.value?.querySelectorAll<HTMLElement>('button,a[href]')
  const first = controls?.[0], last = controls?.[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
function onTouchMode() { if (!touchQuery?.matches) closeContents() }
const activeHeading = ref('')
const attachmentErrors = ref<string[]>([])
const article = ref<{ element?: HTMLElement }>()
let cleanupAudio: (() => void) | undefined
let frame = 0
let disposed = false
let controller: AbortController | undefined
const objectUrls = new Set<string>()
function releaseFiles() {
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  files.value = {}
}
watch(() => [props.content, props.token, props.password], async (_, __, onCleanup) => {
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  onCleanup(() => controller?.abort())
  releaseFiles()
  attachmentErrors.value = []
  // Only fixed BFF URLs are fetched, with credentials in POST bodies.
  const ids = renderShareMarkdown(props.content).attachments
  await Promise.all(ids.map(async (id) => {
    try {
      const blob = await $fetch<Blob>('/api/frontend/shares/file', {
        method: 'POST', responseType: 'blob', signal,
        body: { id, token: props.token, password: props.password },
      })
      if (signal.aborted || disposed) return
      const url = URL.createObjectURL(blob)
      objectUrls.add(url)
      files.value = { ...files.value, [id]: url }
    } catch {
      if (!signal.aborted) attachmentErrors.value.push(id)
    }
  }))
}, { immediate: true })
function syncTableScrolling() {
  for (const table of article.value?.element?.querySelectorAll<HTMLElement>('.table-scroll') || []) {
    const overflowing = table.scrollWidth > table.clientWidth + 1
    if (overflowing) {
      table.tabIndex = 0
      table.setAttribute('role', 'region')
      table.setAttribute('aria-label', '表格，可横向滚动')
    } else {
      table.removeAttribute('tabindex')
      table.removeAttribute('role')
      table.removeAttribute('aria-label')
    }
  }
}
function updateActive() {
  frame = 0
  const headings = article.value?.element?.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id]')
  if (!headings?.length) return
  let current = headings[0]!.id
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top > 160) break
    current = heading.id
  }
  activeHeading.value = current
}
function closeMenus(event: Event) {
  const target = event.target as HTMLElement
  if (event.type !== 'keydown' && target.closest('.reader-menu')) return
  if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return
  closeReaderMenus()
}
function onScroll() {
  if (!frame) frame = requestAnimationFrame(updateActive)
}
function jump(id: string) {
  closeContents()
  const heading = document.getElementById(id)
  if (!heading) return
  heading.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
  activeHeading.value = id
}
async function onArticleClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const diagram = target.closest<HTMLElement>('[data-diagram-index]')
  const svg = diagram?.querySelector<SVGSVGElement>('svg')
  if (diagram && svg) {
    diagram.querySelector<HTMLButtonElement>('.diagram-expand')?.focus({ preventScroll: true })
    await diagramViewer.value?.open(svg)
    return
  }
  const link = target.closest<HTMLAnchorElement>('a[href^="#share-heading-"]')
  if (link) { event.preventDefault(); jump(link.hash.slice(1)) }
}
onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', syncTableScrolling)
  document.addEventListener('click', closeMenus)
  document.addEventListener('keydown', closeMenus)
  diagramTheme = matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = diagramTheme.matches
  diagramTheme.addEventListener('change', onSystemTheme)
  touchQuery = matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)')
  touchQuery.addEventListener('change', onTouchMode)
  await nextTick()
  updateActive()
  syncTableScrolling()
  if (article.value?.element && !article.value.element.querySelector('.voice-message')) cleanupAudio = enhanceShareAudio(article.value.element)
  void renderDiagrams()
  const anchor = resolveArticleAnchor(rendered.value.headings, location.hash)
  if (anchor) jump(anchor)
})
watch(() => [preferences.value.wide, preferences.value.contents], () => nextTick(syncTableScrolling))
watch(activeHeading, () => nextTick(() => {
  const link = document.querySelector<HTMLElement>('.article-contents a.active')
  const nav = link?.parentElement
  if (!link || !nav || !nav.clientHeight) return
  const item = link.getBoundingClientRect(), bounds = nav.getBoundingClientRect()
  if (item.top < bounds.top) nav.scrollTop -= bounds.top - item.top
  else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom
}))
watch(() => rendered.value.html, () => {
  cleanupAudio?.()
  cleanupAudio = undefined
  void nextTick(() => {
    if (disposed) return
    updateActive(); syncTableScrolling(); void renderDiagrams()
    if (article.value?.element && !article.value.element.querySelector('.voice-message')) cleanupAudio = enhanceShareAudio(article.value.element)
  })
})
watch(() => [preferences.value.theme, preferences.value.scheme], () => nextTick(renderDiagrams))
onBeforeUnmount(() => {
  disposed = true
  cleanupAudio?.()
  controller?.abort()
  diagramGeneration++
  diagramTheme?.removeEventListener('change', onSystemTheme)
  touchQuery?.removeEventListener('change', onTouchMode)
  if (contentsDialog.value?.open) { contentsDialog.value.close(); afterContentsClose() }
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', syncTableScrolling)
  document.removeEventListener('click', closeMenus)
  document.removeEventListener('keydown', closeMenus)
  cancelAnimationFrame(frame)
  releaseFiles()
})
</script>
<template>
  <div class="share-reader" :class="{ 'share-wide': preferences.wide }">
    <header class="reader-header">
      <div class="reader-header-inner">
        <div class="reader-document-title">
          <span class="reader-file-icon"><ReaderIcon name="file" /></span>
          <div>
            <h1 :title="title">{{ title }}</h1>
            <div class="reader-document-meta"><span><ReaderIcon name="clock" /><time class="reader-modified-time" :title="modified">{{ modified }}</time></span><span v-if="version" class="reader-version">版本 v{{ version }}</span><span class="reader-views" title="分享浏览次数，按服务端约 5 分钟的汇总周期更新"><ReaderIcon name="eye" />浏览 {{ viewCount === undefined ? '—' : new Intl.NumberFormat('zh-CN').format(viewCount) }}</span></div>
          </div>
        </div>
        <nav class="reader-actions" aria-label="阅读设置">
          <button class="reader-icon desktop-reader-action" :class="{ selected: preferences.wide }" :aria-pressed="preferences.wide" :aria-label="preferences.wide ? '标准宽度' : '宽屏阅读'" @click="preferences.wide = !preferences.wide"><ReaderIcon name="width" /></button>
          <button class="reader-icon desktop-reader-action" aria-label="刷新文章" :disabled="loading" @click="$emit('refresh')"><ReaderIcon name="refresh" :class="{ 'reader-spinning': loading }" /></button>
          <details class="reader-menu desktop-reader-action">
            <summary class="reader-icon" aria-label="配色方案"><ReaderIcon name="palette" /></summary>
            <div class="reader-menu-panel" role="menu" aria-label="配色方案">
              <button v-for="palette in sharePalettes" :key="palette.value" role="menuitemradio" :aria-label="palette.label" :aria-checked="preferences.scheme === palette.value" @click="choose('scheme', palette.value)"><span class="palette-dot" :style="{ backgroundColor: palette.color }" />{{ palette.label }}<span v-if="preferences.scheme === palette.value" class="menu-check">✓</span></button>
            </div>
          </details>
          <details class="reader-menu desktop-reader-action">
            <summary class="reader-icon" aria-label="切换主题"><ReaderIcon :name="preferences.theme === 'dark' ? 'moon' : 'sun'" /></summary>
            <div class="reader-menu-panel" role="menu" aria-label="主题">
              <button v-for="option in [{value:'light',label:'浅色'},{value:'dark',label:'深色'},{value:'system',label:'跟随系统'}]" :key="option.value" role="menuitemradio" :aria-label="option.label" :aria-checked="preferences.theme === option.value" @click="choose('theme', option.value)">{{ option.label }}<span v-if="preferences.theme === option.value" class="menu-check">✓</span></button>
            </div>
          </details>
          <button v-if="rendered.headings.length" class="reader-icon desktop-contents-button" :class="{ selected: preferences.contents }" :aria-label="preferences.contents ? '隐藏目录' : '显示目录'" :aria-expanded="preferences.contents" aria-controls="article-contents" @click="preferences.contents = !preferences.contents"><ReaderIcon name="toc" /></button>
          <button class="reader-icon touch-reader-action" :aria-label="isDark ? '切换浅色模式' : '切换暗黑模式'" @click="toggleTheme"><ReaderIcon :name="isDark ? 'sun' : 'moon'" /></button>
          <details class="reader-menu reader-more touch-reader-action">
            <summary class="reader-icon" aria-label="更多选项"><ReaderIcon name="more" /></summary>
            <div class="reader-menu-panel reader-more-panel" role="menu" aria-label="更多阅读选项">
              <button role="menuitem" :disabled="loading" @click="refreshFromMenu"><ReaderIcon name="refresh" :class="{ 'reader-spinning': loading }" />刷新文章</button>
              <details class="reader-palette-submenu">
                <summary><ReaderIcon name="palette" />修改配色<ReaderIcon name="chevron" /></summary>
                <div class="reader-touch-palettes" role="group" aria-label="配色方案">
                  <button v-for="palette in sharePalettes" :key="palette.value" role="menuitemradio" :aria-label="palette.label" :aria-checked="preferences.scheme === palette.value" @click="choose('scheme', palette.value)"><span class="palette-dot" :style="{ backgroundColor: palette.color }" />{{ palette.label }}<span v-if="preferences.scheme === palette.value" class="menu-check">✓</span></button>
                </div>
              </details>
              <button v-if="outlineHeadings.length" role="menuitem" @click="openContents"><ReaderIcon name="toc" />打开大纲</button>
            </div>
          </details>
        </nav>
      </div>
    </header>
    <main class="reader-main">
      <div class="article-reader" :class="{ 'reader-with-contents': preferences.contents && rendered.headings.length }">
        <article class="article-paper">
          <MarkdownReaderBody ref="article" :html="rendered.html" @article-click="onArticleClick" />
          <p v-if="attachmentErrors.length" class="attachment-error" role="status">部分附件暂时无法加载，请刷新页面重试。</p>
        </article>
        <aside v-if="rendered.headings.length" id="article-contents" class="article-contents" :class="{ 'contents-hidden': !preferences.contents }" aria-label="文章目录">
          <div class="contents-title">大纲</div>
          <nav>
            <a v-for="heading in outlineHeadings" :key="heading.id" :href="`#${heading.id}`" :style="{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }" :class="{ active: activeHeading === heading.id }" :aria-current="activeHeading === heading.id ? 'location' : undefined" @click.prevent="jump(heading.id)">{{ heading.text }}</a>
          </nav>
        </aside>
      </div>
    </main>
    <dialog ref="contentsDialog" class="reader-contents-drawer" aria-labelledby="reader-contents-title" @close="afterContentsClose" @click="onContentsClick" @keydown="onContentsKey">
      <div class="drawer-heading"><div><h2 id="reader-contents-title">文章大纲</h2><p>{{ title }}</p></div><button class="reader-icon" aria-label="关闭大纲" autofocus @click="closeContents"><ReaderIcon name="close" /></button></div>
      <nav aria-label="文章章节">
        <a v-for="heading in outlineHeadings" :key="heading.id" :href="`#${heading.id}`" :style="{ paddingLeft: `${(heading.level - 1) * 10 + 10}px` }" :class="{ active: activeHeading === heading.id }" :aria-current="activeHeading === heading.id ? 'location' : undefined" @click.prevent="jump(heading.id)">{{ heading.text }}</a>
      </nav>
    </dialog>
    <DiagramViewer ref="diagramViewer" />
  </div>
</template>
