import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'

// The pre-paint snippets in frontend/index.html and templates/share.html copy
// these lists and the storage keys; keep them in sync.
export const THEMES = ['dark', 'light'] as const
export const ACCENTS = ['blue', 'purple', 'green', 'orange', 'rose'] as const

export type Theme = (typeof THEMES)[number]
export type Accent = (typeof ACCENTS)[number]

const THEME_KEY = 'mvp-theme'
const ACCENT_KEY = 'mvp-accent'

/** The saved value under `key`, or `fallback` when it is missing, unknown, or unreadable. */
function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return allowed.find((v) => v === saved) ?? fallback
  } catch {
    return fallback
  }
}

interface ThemeCtx {
  theme: Ref<Theme>
  accent: Ref<Accent>
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
}

const KEY: InjectionKey<ThemeCtx> = Symbol('theme')

export function provideTheme() {
  const theme = ref<Theme>(readStored(THEME_KEY, THEMES, 'dark'))
  const accent = ref<Accent>(readStored(ACCENT_KEY, ACCENTS, 'blue'))

  function apply() {
    document.documentElement.setAttribute('data-theme', theme.value)
    document.documentElement.setAttribute('data-accent', accent.value)
  }
  apply()

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem(THEME_KEY, t)
    apply()
  }
  function setAccent(a: Accent) {
    accent.value = a
    localStorage.setItem(ACCENT_KEY, a)
    apply()
  }

  const ctx = { theme, accent, setTheme, setAccent }
  provide(KEY, ctx)
  return ctx
}

export function useTheme() {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('Theme not provided')
  return ctx
}

export function useIsDark() {
  const { theme } = useTheme()
  return computed(() => theme.value === 'dark')
}
