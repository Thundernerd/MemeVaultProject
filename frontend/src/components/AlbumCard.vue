<script setup lang="ts">
import type { Album } from '@/api'

defineProps<{ album: Album }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="group relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-border hover:border-accent transition-colors text-left"
    @click="emit('click')"
  >
    <img
      v-if="album.media[0]"
      :src="album.media[0].thumbnail_path
        ? `/api/media/${album.media[0].id}/thumbnail`
        : `/api/media/${album.media[0].id}/file`"
      :alt="album.title || 'Album'"
      class="w-full h-full object-cover"
      loading="lazy"
    />
    <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
      <p class="text-xs text-white truncate">{{ album.title || 'Album' }}</p>
      <p class="text-[10px] text-white/70">{{ album.media.length }} items</p>
    </div>
    <span class="absolute top-2 right-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/50 text-white">album</span>
  </button>
</template>
