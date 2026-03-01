import { useState, useEffect, useCallback } from 'react';
import { useHalo } from './HaloProvider.js';
import type { Address, CreditScore } from '../types.js';

interface UseHaloScoreResult {
  score: CreditScore | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * React hook to fetch and watch a user's Halo credit score.
 *
 * @example
 * ```tsx
 * function ScoreBadge({ address }: { address: Address }) {
 *   const { score, isLoading } = useHaloScore(address);
 *   if (isLoading) return <Spinner />;
 *   return <span>{score?.score} — {score?.tier}</span>;
 * }
 * ```
 */
export function useHaloScore(address: Address | undefined): UseHaloScoreResult {
  const { sdk } = useHalo();
  const [score, setScore] = useState<CreditScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await sdk.scores.get(address);
      setScore(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [address, sdk]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { score, isLoading, error, refetch: fetch };
}
