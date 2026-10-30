<script setup lang="ts">
import { readerIconPaths, type ReaderIconName } from '~/utils/reader-icons'
defineProps<{ name: ReaderIconName }>()
</script>
<template><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="readerIconPaths[name]" /></svg></template>
