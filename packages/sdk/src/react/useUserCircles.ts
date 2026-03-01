import { useState, useEffect, useCallback } from 'react';
import { useHalo } from './HaloProvider.js';
import type { CircleSummary } from '../types.js';

/**
 * Fetch all circles a user is a member of.
 */
export function useUserCircles(address?: string) {
  const { sdk } = useHalo();
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!address) { setCircles([]); return; }
    setIsLoading(true);
    try {
      const result = await sdk.circles.getForUser(address);
      setCircles(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [sdk, address]);

  useEffect(() => { fetch(); }, [fetch]);

  return { circles, isLoading, error, refetch: fetch };
}

/**
 * Hook for the full detail of a single circle.
 */
export function useCircleDetail(circleId: string | undefined) {
  const { sdk } = useHalo();
  const [circle, setCircle] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!circleId) return;
    setIsLoading(true);
    try {
      const result = await sdk.circles.get(circleId);
      setCircle(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [sdk, circleId]);

  useEffect(() => { fetch(); }, [fetch]);
  // Refresh every 30s when active
  useEffect(() => {
    if (!circleId) return;
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, [fetch, circleId]);

  return { circle, isLoading, error, refetch: fetch };
}

/**
 * Hook for list of circles (with optional status filter).
 */
export function useCircles(status?: string) {
  const { sdk } = useHalo();
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await sdk.circles.list({ status, limit: 50 });
      setCircles(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [sdk, status]);

  useEffect(() => { fetch(); }, [fetch]);

  return { circles, isLoading, error, refetch: fetch };
}
