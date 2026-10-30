<script setup lang="ts">
const dialog = ref<HTMLDialogElement>()
const viewport = ref<HTMLElement>()
const content = ref('')
const scale = ref(1)
const natural = ref({ width: 1200, height: 800 })
const dragging = ref(false)
const drawingStyle = computed(() => ({ width: `${natural.value.width * scale.value}px`, height: `${natural.value.height * scale.value}px` }))
const idPrefix = useId().replace(/[^a-zA-Z0-9]/g, '')
let opener: HTMLElement | null = null
let sourceContainer: Element | null = null
let drag: { x: number; y: number; left: number; top: number } | null = null
let resizeObserver: ResizeObserver | undefined
let savedOverflow = ''
const opened = ref(false)
function fit() {
  const area = viewport.value
  if (!area) return
  scale.value = Math.max(.001, Math.min((area.clientWidth - 64) / natural.value.width, (area.clientHeight - 64) / natural.value.height, 2))
  area.scrollTo(0, 0)
}
async function zoom(next: number, clientX?: number, clientY?: number) {
  const area = viewport.value
  if (!area) return
  const rect = area.getBoundingClientRect()
  const x = clientX === undefined ? area.clientWidth / 2 : clientX - rect.left
  const y = clientY === undefined ? area.clientHeight / 2 : clientY - rect.top
  const before = scale.value
  const after = Math.max(.001, Math.min(next, 8))
  const canvas = area.querySelector<HTMLElement>('.diagram-drawing')!
  const offset = canvas.getBoundingClientRect()
  const originX = (clientX === undefined ? rect.left + x : clientX) - offset.left
  const originY = (clientY === undefined ? rect.top + y : clientY) - offset.top
  scale.value = after
  await nextTick()
  const moved = canvas.getBoundingClientRect()
  area.scrollLeft += moved.left + originX * after / before - (rect.left + x)
  area.scrollTop += moved.top + originY * after / before - (rect.top + y)
}
function wheel(event: WheelEvent) { event.preventDefault(); const delta = Math.max(-100, Math.min(100, event.deltaY)); void zoom(scale.value * Math.exp(-delta * .002), event.clientX, event.clientY) }
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !viewport.value) return
  event.preventDefault()
  drag = { x: event.clientX, y: event.clientY, left: viewport.value.scrollLeft, top: viewport.value.scrollTop }
  dragging.value = true
  viewport.value.setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag || !viewport.value) return
  viewport.value.scrollLeft = drag.left + drag.x - event.clientX
  viewport.value.scrollTop = drag.top + drag.y - event.clientY
}
function endDrag() { dragging.value = false; drag = null }
function onKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Tab') {
    const controls = dialog.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    const first = controls?.[0], last = controls?.[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    return
  }
  const area = viewport.value
  if (!area) return
  if (['+', '=', '-','0', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault()
  if (event.key === '+' || event.key === '=') void zoom(scale.value * 1.25)
  else if (event.key === '-') void zoom(scale.value / 1.25)
  else if (event.key === '0') fit()
  else if (event.key === 'ArrowUp') area.scrollTop -= 80
  else if (event.key === 'ArrowDown') area.scrollTop += 80
  else if (event.key === 'ArrowLeft') area.scrollLeft -= 80
  else if (event.key === 'ArrowRight') area.scrollLeft += 80
}
function setDrawing(svg: SVGSVGElement) {
  // Mermaid already sanitizes this SVG. Namespace the clone's IDs to keep
  // markers and CSS references independent of the inline graph.
  const clone = svg.cloneNode(true) as SVGSVGElement
  const nodes = [clone, ...clone.querySelectorAll<SVGElement>('[id]')]
  const ids = new Map(nodes.filter(node => node.id).map(node => [node.id, `viewer-${idPrefix}-${node.id}`]))
  const remap = (value: string) => value.replace(/#([\w:-]+)/g, (match, id) => ids.has(id) ? `#${ids.get(id)}` : match)
  for (const node of [clone, ...clone.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (attr.name === 'id') node.id = ids.get(attr.value) || attr.value
      else node.setAttribute(attr.name, remap(attr.value))
    }
    if (node.tagName.toLowerCase() === 'style') node.textContent = remap(node.textContent || '')
  }
  const bounds = svg.viewBox.baseVal
  natural.value = { width: bounds.width || 1200, height: bounds.height || 800 }
  clone.removeAttribute('width'); clone.removeAttribute('height'); clone.removeAttribute('style')
  content.value = clone.outerHTML
}
function update(svg: SVGSVGElement) {
  if (!opened.value || svg.parentElement !== sourceContainer) return
  setDrawing(svg)
  opener = sourceContainer?.querySelector<HTMLButtonElement>('.diagram-expand') || opener
}
async function open(svg: SVGSVGElement) {
  if (!dialog.value || opened.value) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  sourceContainer = svg.parentElement
  setDrawing(svg)
  savedOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  opened.value = true
  dialog.value.showModal()
  await nextTick()
  fit()
  resizeObserver = new ResizeObserver(fit)
  resizeObserver.observe(dialog.value!)
}
function close() { dialog.value?.close() }
function afterClose() {
  if (!opened.value) return
  opened.value = false
  content.value = ''
  sourceContainer = null
  endDrag()
  resizeObserver?.disconnect()
  document.body.style.overflow = savedOverflow
  opener?.focus({ preventScroll: true })
}
onBeforeUnmount(() => { dialog.value?.close(); afterClose() })
defineExpose({ open, update })
</script>
<template>
  <dialog ref="dialog" class="diagram-viewer" aria-labelledby="diagram-viewer-title" @close="afterClose" @keydown="onKey">
    <header class="diagram-viewer-toolbar">
      <div><h2 id="diagram-viewer-title">图表全屏查看</h2><span class="diagram-viewer-hint">滚轮缩放 · 拖拽移动 · Esc 关闭</span></div>
      <div class="diagram-viewer-actions">
        <output aria-label="当前缩放">{{ Math.round(scale * 100) }}%</output>
        <button class="reader-icon" aria-label="缩小图表" @click="zoom(scale / 1.25)"><ReaderIcon name="zoomOut" /></button>
        <button class="reader-icon" aria-label="放大图表" @click="zoom(scale * 1.25)"><ReaderIcon name="zoomIn" /></button>
        <button class="reader-icon" aria-label="原始大小" @click="zoom(1)">1:1</button>
        <button class="reader-icon" aria-label="适应窗口" @click="fit"><ReaderIcon name="reset" /></button>
        <button class="reader-icon" aria-label="关闭图表" autofocus @click="close"><ReaderIcon name="close" /></button>
      </div>
    </header>
    <div ref="viewport" class="diagram-viewport" :class="{ dragging }" @wheel="wheel" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
      <div class="diagram-canvas"><div class="diagram-drawing" :style="drawingStyle" v-html="content" /></div>
    </div>
  </dialog>
</template>
