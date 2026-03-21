'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROUTES = [
  { href: '/neural', label: 'Neural' },
  { href: '/jack', label: 'Jack' },
  { href: '/julia', label: 'Julia' },
  { href: '/singularity', label: 'Singularity' },
  { href: '/workspace', label: 'Workspace' },
];

export default function SovereignSwitcher() {
  const pathname = usePathname();

  return (
    <nav className="sovereign-switcher" aria-label="Sovereign switcher">
      {ROUTES.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          prefetch
          className={`sovereign-switcher__link ${pathname === route.href ? 'is-active' : ''}`}
        >
          {route.label}
        </Link>
      ))}
    </nav>
  );
}
