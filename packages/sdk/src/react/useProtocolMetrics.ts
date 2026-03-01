import { useState, useEffect, useCallback } from 'react';
import { useHalo } from './HaloProvider.js';
import type { ProtocolMetrics } from '../types.js';

export function useProtocolMetrics() {
  const { sdk } = useHalo();
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await sdk.getProtocolMetrics();
      setMetrics(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  useEffect(() => { fetch(); }, [fetch]);

  // Refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { metrics, isLoading, error, refetch: fetch };
}
