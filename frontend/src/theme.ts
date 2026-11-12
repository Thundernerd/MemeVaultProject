import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'

export const THEMES = ['dark', 'light'] as const
export const ACCENTS = ['blue', 'purple', 'green', 'orange', 'rose'] as const

export type Theme = (typeof THEMES)[number]
export type Accent = (typeof ACCENTS)[number]

/** The saved theme, or 'dark' when it is missing or not a known theme. */
export function storedTheme(): Theme {
  const saved = localStorage.getItem('mvp-theme')
  return (THEMES as readonly string[]).includes(saved ?? '') ? (saved as Theme) : 'dark'
}

/** The saved accent, or 'blue' when it is missing or not a known accent. */
export function storedAccent(): Accent {
  const saved = localStorage.getItem('mvp-accent')
  return (ACCENTS as readonly string[]).includes(saved ?? '') ? (saved as Accent) : 'blue'
}

interface ThemeCtx {
  theme: Ref<Theme>
  accent: Ref<Accent>
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
}

const KEY: InjectionKey<ThemeCtx> = Symbol('theme')

export function provideTheme() {
  const theme = ref<Theme>(storedTheme())
  const accent = ref<Accent>(storedAccent())

  function apply() {
    document.documentElement.setAttribute('data-theme', theme.value)
    document.documentElement.setAttribute('data-accent', accent.value)
  }
  apply()

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem('mvp-theme', t)
    apply()
  }
  function setAccent(a: Accent) {
    accent.value = a
    localStorage.setItem('mvp-accent', a)
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
