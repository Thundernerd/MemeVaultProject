'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
type Accent = 'blue' | 'purple' | 'green' | 'orange' | 'rose';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  accent: 'blue',
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [accent, setAccentState] = useState<Accent>('blue');

  useEffect(() => {
    const savedTheme = (localStorage.getItem('mvp-theme') as Theme) ?? 'dark';
    const savedAccent = (localStorage.getItem('mvp-accent') as Accent) ?? 'blue';
    setThemeState(savedTheme);
    setAccentState(savedAccent);
    // Attributes are already applied by the inline FOUC script, but sync state here
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('mvp-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  function setAccent(a: Accent) {
    setAccentState(a);
    localStorage.setItem('mvp-accent', a);
    document.documentElement.setAttribute('data-accent', a);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}
