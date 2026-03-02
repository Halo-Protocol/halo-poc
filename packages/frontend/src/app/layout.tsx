import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Halo Protocol — On-chain Credit for Everyone',
  description: 'Build your on-chain credit score through ROSCA circles. Portable. Transparent. Verifiable.',
  openGraph: {
    title: 'Halo Protocol',
    description: 'On-chain credit infrastructure for the next billion users',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-gray-950 text-white antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
