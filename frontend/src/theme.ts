import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'

export type Theme = 'dark' | 'light'
export type Accent = 'blue' | 'purple' | 'green' | 'orange' | 'rose'

interface ThemeCtx {
  theme: Ref<Theme>
  accent: Ref<Accent>
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
}

const KEY: InjectionKey<ThemeCtx> = Symbol('theme')

export function provideTheme() {
  const theme = ref<Theme>((localStorage.getItem('mvp-theme') as Theme) || 'dark')
  const accent = ref<Accent>((localStorage.getItem('mvp-accent') as Accent) || 'blue')

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
