'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/circles', label: 'Circles' },
  { href: '/score', label: 'My Score' },
];

export function Navbar() {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-white">Halo</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900 text-sky-300 font-mono">
            Sepolia
          </span>
        </Link>

        {/* Nav links */}
        {isConnected && (
          <div className="hidden md:flex items-center gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        )}

        {/* Wallet */}
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="address"
        />
      </div>
    </nav>
  );
}
