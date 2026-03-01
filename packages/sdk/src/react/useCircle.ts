import { useState, useEffect, useCallback } from 'react';
import { useHalo } from './HaloProvider.js';
import type { Address, Circle, CircleStatus } from '../types.js';

export function useCircle(circleId: bigint | undefined) {
  const { sdk } = useHalo();
  const [circle, setCircle] = useState<Circle | null>(null);
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
  }, [circleId, sdk]);

  useEffect(() => { fetch(); }, [fetch]);

  return { circle, isLoading, error, refetch: fetch };
}

export function useCircles(options?: { status?: CircleStatus; first?: number }) {
  const { sdk } = useHalo();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await sdk.circles.list(options);
      setCircles(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [options?.status, sdk]);

  useEffect(() => { fetch(); }, [fetch]);

  return { circles, isLoading, error, refetch: fetch };
}

export function useUserCircles(address: Address | undefined) {
  const { sdk } = useHalo();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    try {
      const result = await sdk.circles.getForUser(address);
      setCircles(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [address, sdk]);

  useEffect(() => { fetch(); }, [fetch]);

  return { circles, isLoading, error, refetch: fetch };
}
