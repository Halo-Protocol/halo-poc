'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi';
import { HaloProvider } from '@halo-protocol/sdk/react';
import { CHAIN_IDS } from '@halo-protocol/sdk';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const haloConfig = {
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '421614') as 421614 | 42161,
  subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
  apiUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <HaloProvider config={haloConfig}>
            {children}
          </HaloProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
