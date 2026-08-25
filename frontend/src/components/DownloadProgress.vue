<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  progress: number
}>()

const active = computed(() => props.status === 'pending' || props.status === 'downloading')
const indeterminate = computed(
  () => props.status === 'downloading' && props.progress < 1,
)
const width = computed(() => Math.max(0, Math.min(100, props.progress)))
const label = computed(() => {
  if (props.status === 'pending') return 'Waiting'
  if (props.status === 'downloading') {
    if (props.progress >= 99) return 'Processing…'
    if (props.progress < 1) return 'Starting…'
    return `${Math.round(props.progress)}%`
  }
  return props.status
})
</script>

<template>
  <div v-if="active" class="flex flex-col gap-1 w-full">
    <p class="text-xs text-text-muted tabular-nums">{{ label }}</p>
    <div class="h-2 bg-surface-3 rounded-full overflow-hidden">
      <div
        v-if="indeterminate"
        class="h-full w-1/3 bg-accent rounded-full mv-progress-indeterminate"
      />
      <div
        v-else
        class="h-full bg-accent rounded-full transition-all duration-300"
        :style="{ width: `${width}%` }"
      />
    </div>
  </div>
</template>
