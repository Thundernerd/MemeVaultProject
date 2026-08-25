<script setup lang="ts">
import type { MediaItem } from '@/api'

defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="group relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-border hover:border-accent transition-colors text-left"
    @click="emit('click')"
  >
    <img
      v-if="item.thumbnail_path || item.type === 'image'"
      :src="`/api/media/${item.id}/thumbnail`"
      :alt="item.title || ''"
      class="w-full h-full object-cover"
      loading="lazy"
      @error="($event.target as HTMLImageElement).style.display = 'none'"
    />
    <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
      <p class="text-xs text-white truncate">{{ item.title || item.type }}</p>
    </div>
    <span class="absolute top-2 right-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/50 text-white">
      {{ item.type }}
    </span>
  </button>
</template>
