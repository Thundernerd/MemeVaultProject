'use client';

import { useRef, useState, useEffect } from 'react';
import { useTheme } from './ThemeProvider';

const accents = [
  { value: 'blue',   label: 'Blue',   color: '#3b82f6' },
  { value: 'purple', label: 'Purple', color: '#a855f7' },
  { value: 'green',  label: 'Green',  color: '#22c55e' },
  { value: 'orange', label: 'Orange', color: '#f97316' },
  { value: 'rose',   label: 'Rose',   color: '#f43f5e' },
] as const;

interface Props {
  compact?: boolean;
}

export default function ThemeSwitcher({ compact = false }: Props) {
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const currentAccent = accents.find((a) => a.value === accent);

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Appearance settings"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
        >
          <span className="text-sm leading-none">{theme === 'dark' ? '🌙' : '☀️'}</span>
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: currentAccent?.color }}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface-1 border border-border rounded-xl shadow-lg p-3 flex flex-col gap-3 z-[100]">
            {/* Theme toggle */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Mode</p>
              <div className="flex gap-1.5">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      theme === t
                        ? 'bg-accent-subtle text-accent border-accent/30'
                        : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                  >
                    <span>{t === 'dark' ? '🌙' : '☀️'}</span>
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accent swatches */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Accent</p>
              <div className="flex gap-2">
                {accents.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAccent(a.value)}
                    title={a.label}
                    aria-label={`Accent: ${a.label}`}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: a.color,
                      boxShadow: accent === a.value ? `0 0 0 2px var(--surface-1), 0 0 0 3.5px ${a.color}` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full mode (Settings page)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wide">Mode</p>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                theme === t
                  ? 'bg-accent-subtle text-accent border-accent/30'
                  : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`}
            >
              <span>{t === 'dark' ? '🌙' : '☀️'}</span>
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wide">Accent color</p>
        <div className="flex gap-2 flex-wrap">
          {accents.map((a) => (
            <button
              key={a.value}
              onClick={() => setAccent(a.value)}
              title={a.label}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                accent === a.value
                  ? 'border-accent/40 bg-accent-subtle text-text-primary'
                  : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.color }}
              />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
