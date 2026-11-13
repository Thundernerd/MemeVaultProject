<script setup lang="ts">
import type { Album } from '@/api'

defineProps<{ album: Album }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="card card-album"
    @click="emit('click')"
  >
    <span class="card-thumb">
      <img
        v-if="album.media[0]"
        :src="album.media[0].thumbnail_path
          ? `/api/media/${album.media[0].id}/thumbnail`
          : `/api/media/${album.media[0].id}/file`"
        :alt="album.title || 'Album'"
        loading="lazy"
      />
    </span>
    <span class="card-caption">
      <span class="truncate">{{ album.title || 'Album' }}</span>
      <span class="card-sub label">{{ album.media.length }} items</span>
    </span>
    <span class="sticker label">album</span>
  </button>
</template>
