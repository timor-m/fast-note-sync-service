<script setup lang="ts">
const dialog = ref<HTMLDialogElement>()
const viewport = ref<HTMLElement>()
const content = ref('')
const scale = ref(1)
const natural = ref({ width: 1200, height: 800 })
const dragging = ref(false)
const pan = ref({ x: 0, y: 0 })
const drawingStyle = computed(() => ({ width: `${natural.value.width * scale.value}px`, height: `${natural.value.height * scale.value}px`, transform: `translate(-50%, -50%) translate(${pan.value.x}px, ${pan.value.y}px)` }))
const idPrefix = useId().replace(/[^a-zA-Z0-9]/g, '')
let opener: HTMLElement | null = null
let sourceContainer: Element | null = null
let drag: { pointerId: number; x: number; y: number; left: number; top: number } | null = null
let resizeObserver: ResizeObserver | undefined
let savedOverflow = ''
const opened = ref(false)
function fit() {
  const area = viewport.value
  if (!area) return
  scale.value = Math.max(.001, Math.min((area.clientWidth - 64) / natural.value.width, (area.clientHeight - 64) / natural.value.height, 2))
  pan.value = { x: 0, y: 0 }
}
function zoom(next: number, clientX?: number, clientY?: number) {
  const area = viewport.value
  if (!area) return
  const rect = area.getBoundingClientRect()
  const x = clientX === undefined ? 0 : clientX - rect.left - area.clientWidth / 2
  const y = clientY === undefined ? 0 : clientY - rect.top - area.clientHeight / 2
  const after = Math.max(.001, Math.min(next, 8))
  const ratio = after / scale.value
  pan.value = { x: x - (x - pan.value.x) * ratio, y: y - (y - pan.value.y) * ratio }
  scale.value = after
}
function wheel(event: WheelEvent) { event.preventDefault(); const delta = Math.max(-100, Math.min(100, event.deltaY)); zoom(scale.value * Math.exp(-delta * .002), event.clientX, event.clientY) }
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary || !viewport.value || drag) return
  event.preventDefault()
  viewport.value.focus({ preventScroll: true })
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: pan.value.x, top: pan.value.y }
  dragging.value = true
  viewport.value.setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  pan.value = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y }
}
function endDrag() {
  const pointerId = drag?.pointerId
  dragging.value = false
  drag = null
  if (pointerId !== undefined && viewport.value?.hasPointerCapture(pointerId)) viewport.value.releasePointerCapture(pointerId)
}
function onKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Tab') {
    const controls = dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')
    const first = controls?.[0], last = controls?.[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    return
  }
  const area = viewport.value
  if (!area) return
  if (['+', '=', '-','0', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault()
  if (event.key === '+' || event.key === '=') zoom(scale.value * 1.25)
  else if (event.key === '-') zoom(scale.value / 1.25)
  else if (event.key === '0') fit()
  else if (event.key === 'ArrowUp') pan.value.y += 80
  else if (event.key === 'ArrowDown') pan.value.y -= 80
  else if (event.key === 'ArrowLeft') pan.value.x += 80
  else if (event.key === 'ArrowRight') pan.value.x -= 80
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
  viewport.value?.focus({ preventScroll: true })
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
        <button class="reader-icon" aria-label="关闭图表" @click="close"><ReaderIcon name="close" /></button>
      </div>
    </header>
    <div ref="viewport" class="diagram-viewport" tabindex="0" autofocus aria-label="图表画布，可拖动、滚轮缩放或使用方向键移动" :class="{ dragging }" @wheel="wheel" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
      <div class="diagram-canvas"><div class="diagram-drawing" :style="drawingStyle" v-html="content" /></div>
    </div>
  </dialog>
</template>
