import React, { createContext, useContext, useMemo } from 'react';
import { HaloSDK } from '../HaloSDK.js';
import type { HaloConfig } from '../types.js';

interface HaloContextValue {
  sdk: HaloSDK;
}

const HaloContext = createContext<HaloContextValue | null>(null);

export interface HaloProviderProps {
  config: HaloConfig;
  children: React.ReactNode;
}

/**
 * Provider that makes HaloSDK available to all child components.
 * Use this at the root of your app.
 *
 * @example
 * ```tsx
 * <HaloProvider config={{ chainId: 421614 }}>
 *   <App />
 * </HaloProvider>
 * ```
 */
export function HaloProvider({ config, children }: HaloProviderProps) {
  const sdk = useMemo(() => new HaloSDK(config), [config.chainId]);

  return <HaloContext.Provider value={{ sdk }}>{children}</HaloContext.Provider>;
}

export function useHalo(): HaloContextValue {
  const ctx = useContext(HaloContext);
  if (!ctx) throw new Error('useHalo must be used within <HaloProvider>');
  return ctx;
}
