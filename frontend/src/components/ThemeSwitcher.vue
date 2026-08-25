<script setup lang="ts">
import { useTheme, type Accent, type Theme } from '@/theme'

const { theme, accent, setTheme, setAccent } = useTheme()
const accents: Accent[] = ['blue', 'purple', 'green', 'orange', 'rose']
const colors: Record<Accent, string> = {
  blue: '#3b82f6',
  purple: '#a855f7',
  green: '#22c55e',
  orange: '#f97316',
  rose: '#f43f5e',
}

function toggleTheme() {
  setTheme((theme.value === 'dark' ? 'light' : 'dark') as Theme)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      class="px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-surface-2"
      @click="toggleTheme"
      :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
    >
      {{ theme === 'dark' ? '☀' : '☾' }}
    </button>
    <button
      v-for="a in accents"
      :key="a"
      class="w-4 h-4 rounded-full"
      :style="{
        background: colors[a],
        boxShadow: accent === a ? `0 0 0 2px var(--surface-1), 0 0 0 3.5px ${colors[a]}` : undefined,
      }"
      :title="a"
      @click="setAccent(a)"
    />
  </div>
</template>
