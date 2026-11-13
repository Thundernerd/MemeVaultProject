<script setup lang="ts">
import { computed } from 'vue'
import { ACCENTS, useTheme, type Theme } from '@/theme'

const { theme, accent, setTheme, setAccent } = useTheme()
const toggleLabel = computed(() => (theme.value === 'dark' ? 'Light mode' : 'Dark mode'))

function toggleTheme() {
  setTheme((theme.value === 'dark' ? 'light' : 'dark') as Theme)
}
</script>

<template>
  <div class="theme-switch">
    <button
      type="button"
      class="btn btn-sm btn-icon"
      :title="toggleLabel"
      :aria-label="toggleLabel"
      @click="toggleTheme"
    >
      {{ theme === 'dark' ? '☀' : '☾' }}
    </button>
    <div class="swatches">
      <button
        v-for="a in ACCENTS"
        :key="a"
        type="button"
        class="swatch"
        :data-accent="a"
        :title="a"
        :aria-label="`Accent ${a}`"
        :aria-pressed="accent === a"
        @click="setAccent(a)"
      />
    </div>
  </div>
</template>
