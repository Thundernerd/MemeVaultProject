<script setup lang="ts">
import { useTheme, type Accent, type Theme } from '@/theme'

const { theme, accent, setTheme, setAccent } = useTheme()
const accents: Accent[] = ['blue', 'purple', 'green', 'orange', 'rose']

function toggleTheme() {
  setTheme((theme.value === 'dark' ? 'light' : 'dark') as Theme)
}
</script>

<template>
  <div class="theme-switch">
    <button
      type="button"
      class="btn btn-sm btn-icon"
      :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
      :aria-label="theme === 'dark' ? 'Light mode' : 'Dark mode'"
      @click="toggleTheme"
    >
      {{ theme === 'dark' ? '☀' : '☾' }}
    </button>
    <div class="swatches">
      <button
        v-for="a in accents"
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
