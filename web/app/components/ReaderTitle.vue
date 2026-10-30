<script setup lang="ts">
defineProps<{ text: string }>()
const viewport = ref<HTMLElement>()
const label = ref<HTMLElement>()
let observer: ResizeObserver | undefined
let motion: MediaQueryList | undefined
let animation: Animation | undefined
let previousDistance = -1

function update() {
  const container = viewport.value
  const text = label.value
  if (!container?.isConnected || !text) return
  const distance = motion?.matches ? 0 : Math.max(0, text.scrollWidth - container.clientWidth)
  if (distance === previousDistance) return
  previousDistance = distance
  animation?.cancel()
  animation = undefined
  if (distance <= 1) return
  // About 24 px/s, with a two-second pause at either end.
  const travel = Math.max(2500, distance / 24 * 1000)
  const pause = 2000
  const duration = 2 * (travel + pause)
  const easing = 'cubic-bezier(.45, 0, .55, 1)'
  animation = text.animate([
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: pause / duration, easing },
    { transform: `translateX(-${distance}px)`, offset: (pause + travel) / duration },
    { transform: `translateX(-${distance}px)`, offset: (2 * pause + travel) / duration, easing },
    { transform: 'translateX(0)', offset: 1 },
  ], { duration, iterations: Infinity })
}
onMounted(() => {
  motion = matchMedia('(prefers-reduced-motion: reduce)')
  motion.addEventListener('change', update)
  observer = new ResizeObserver(update)
  observer.observe(viewport.value!)
  observer.observe(label.value!)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  motion?.removeEventListener('change', update)
  animation?.cancel()
})
</script>
<template>
  <h1 ref="viewport" class="reader-scrolling-title" :title="text"><span ref="label">{{ text }}</span></h1>
</template>
<style scoped>
.reader-scrolling-title { overflow: hidden; white-space: nowrap; text-overflow: clip; }
.reader-scrolling-title > span { display: inline-block; white-space: nowrap; }
</style>
