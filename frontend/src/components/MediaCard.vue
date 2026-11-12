<script setup lang="ts">
import { ref } from 'vue'
import type { MediaItem } from '@/api'

defineProps<{ item: MediaItem }>()
const emit = defineEmits<{ click: [] }>()

const thumbFailed = ref(false)
</script>

<template>
  <button
    type="button"
    class="card"
    :class="`card-${item.type}`"
    @click="emit('click')"
  >
    <span class="card-thumb">
      <img
        v-if="(item.thumbnail_path || item.type === 'image') && !thumbFailed"
        :src="`/api/media/${item.id}/thumbnail`"
        :alt="item.title || ''"
        loading="lazy"
        @error="thumbFailed = true"
      />
      <span v-else class="no-thumb label">No thumbnail</span>
    </span>
    <span class="card-caption">
      <span class="truncate">{{ item.title || item.type }}</span>
    </span>
    <span class="sticker label">{{ item.type }}</span>
  </button>
</template>
