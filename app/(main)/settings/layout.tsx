'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/settings/general', label: 'General' },
  { href: '/settings/binaries', label: 'Binaries' },
  { href: '/settings/cookies', label: 'Cookies' },
  { href: '/settings/sharing', label: 'Sharing' },
  { href: '/settings/api', label: 'API' },
  { href: '/settings/discord', label: 'Discord' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6 pb-12">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
      <nav className="flex gap-1 border-b border-border">
        {tabs.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                active
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
