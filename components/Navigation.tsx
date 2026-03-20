'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import { useTheme } from './ThemeProvider';
import { version } from '@/package.json';

const links = [
  { href: '/', label: 'Vault' },
  { href: '/queue', label: 'Queue' },
  { href: '/tags', label: 'Tags' },
  { href: '/settings', label: 'Settings' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const iconClass = `w-8 h-8 shrink-0 ${theme === 'dark' ? 'invert mix-blend-screen' : 'mix-blend-multiply'}`;

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <>
      {/* ── Top bar (all sizes) ─────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface-1/70 backdrop-blur-md border-b border-border z-50">
        <div className="max-w-5xl mx-auto h-full flex items-center gap-6 px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/safe.png" alt="MVP" className={iconClass} />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-base font-bold text-text-primary tracking-tight">MVP</span>
              <span className="text-[10px] text-text-muted">v{version}</span>
            </div>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map(({ href, label }) => {
              const active = href === '/' ? pathname === href : pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                    active
                      ? 'bg-accent-subtle text-accent animate-[nav-activate_0.35s_ease-out]'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitcher compact />
            <Link
              href="/auth/logout"
              className="hidden md:block px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              Sign out
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="md:hidden text-text-secondary hover:text-text-primary p-2 rounded-lg hover:bg-surface-2 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect y="3" width="20" height="2" rx="1" />
                <rect y="9" width="20" height="2" rx="1" />
                <rect y="15" width="20" height="2" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer backdrop ────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-50"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer panel ───────────────────────────────────── */}
      <div
        className={`md:hidden fixed top-0 left-0 h-full w-64 bg-surface-1 border-r border-border flex flex-col pt-6 px-4 gap-2 z-[60] transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2.5">
            <img src="/safe.png" alt="MVP" className={iconClass} />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-base font-bold text-text-primary tracking-tight">MVP</span>
              <span className="text-[10px] text-text-muted">v{VERSION}</span>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M1 1l16 16M17 1L1 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        {links.map(({ href, label }) => {
          const active = href === '/' ? pathname === href : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 ${
                active
                  ? 'bg-accent-subtle text-accent animate-[nav-activate_0.35s_ease-out]'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
              }`}
            >
              {label}
            </Link>
          );
        })}
        <div className="mt-auto mb-4 flex flex-col gap-3">
          <Link
            href="/auth/logout"
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            Sign out
          </Link>
        </div>
      </div>
    </>
  );
}
