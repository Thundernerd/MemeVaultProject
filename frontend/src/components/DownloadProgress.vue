<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
  progress: number
}>()

const active = computed(() => props.status === 'pending' || props.status === 'downloading')
const waiting = computed(() => props.status === 'pending')
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
  <div v-if="active" class="progress">
    <p class="label progress-label">{{ label }}</p>
    <div
      class="progress-track"
      :class="{ indeterminate, waiting }"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="indeterminate || waiting ? undefined : Math.round(width)"
    >
      <div class="progress-fill" :style="indeterminate ? undefined : { width: `${width}%` }" />
    </div>
  </div>
</template>
