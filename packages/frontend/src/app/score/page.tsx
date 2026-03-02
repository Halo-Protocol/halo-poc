'use client';

import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useHaloScore } from '@halo-protocol/sdk/react';
import { ScoreGauge } from '../../components/shared/ScoreGauge.js';
import type { Address } from 'viem';

const EVENT_LABELS: Record<string, string> = {
  ON_TIME_PAYMENT: 'On-time payment',
  EARLY_PAYMENT: 'Early payment',
  GRACE_PERIOD_PAYMENT: 'Grace period payment',
  SOFT_DEFAULT: 'Soft default',
  HARD_DEFAULT: 'Hard default',
  CIRCLE_COMPLETION: 'Circle completed',
  VOUCH_RECEIVED: 'Vouch received',
  STREAK_3_MONTH: '3-month streak',
  STREAK_6_MONTH: '6-month streak',
  STREAK_12_MONTH: '12-month streak',
  FRAUD_REPORT: 'Fraud report',
  INACTIVITY_DECAY: 'Inactivity decay',
};

const TIER_RANGES = [
  { tier: 'Poor', min: 300, max: 580, color: '#ef4444' },
  { tier: 'Fair', min: 580, max: 670, color: '#f97316' },
  { tier: 'Good', min: 670, max: 740, color: '#eab308' },
  { tier: 'Very Good', min: 740, max: 800, color: '#22c55e' },
  { tier: 'Exceptional', min: 800, max: 850, color: '#6366f1' },
];

export default function ScorePage() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect to view your Halo Score</h2>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return <ScoreContent address={address as Address} />;
}

function ScoreContent({ address }: { address: Address }) {
  const { score, isLoading } = useHaloScore(address);

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-3xl mx-auto animate-pulse space-y-6">
        <div className="h-10 bg-gray-800 rounded w-48" />
        <div className="h-64 bg-gray-900 rounded-2xl" />
      </div>
    );
  }

  const currentScore = score?.score ?? 500;

  return (
    <div className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Halo Credit Score</h1>

      {/* Score gauge card */}
      <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 mb-6 flex flex-col items-center">
        <ScoreGauge score={currentScore} size={220} />
        <div className="mt-4 text-center">
          <div className="text-sm text-gray-400">
            Top <span className="text-white font-medium">{100 - (score?.percentile ?? 50)}%</span> of all users
          </div>
          {score?.score === 500 && score?.history?.length === 0 && (
            <div className="mt-2 text-xs text-yellow-400">
              Join a circle to start building your score
            </div>
          )}
        </div>
      </div>

      {/* Tier map */}
      <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 mb-6">
        <h2 className="font-semibold text-gray-300 mb-4">Score Tiers</h2>
        <div className="space-y-2">
          {TIER_RANGES.map(({ tier, min, max, color }) => {
            const isCurrentTier = currentScore >= min && (currentScore < max || (tier === 'Exceptional' && currentScore <= 850));
            return (
              <div key={tier} className={`flex items-center gap-3 p-2 rounded-lg ${isCurrentTier ? 'bg-gray-800' : ''}`}>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 text-sm">
                  <span className={`font-medium ${isCurrentTier ? 'text-white' : 'text-gray-400'}`}>{tier}</span>
                  <span className="text-gray-500 ml-2">{min}–{max}</span>
                </div>
                {isCurrentTier && (
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">You</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Score components */}
      {score?.components && (
        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 mb-6">
          <h2 className="font-semibold text-gray-300 mb-4">Score Breakdown</h2>
          <div className="space-y-4">
            {[
              { label: 'Payment History', key: 'paymentHistory', max: 340, weight: '40%' },
              { label: 'Circle Completion', key: 'circleCompletion', max: 212, weight: '25%' },
              { label: 'Account Age', key: 'accountAge', max: 127, weight: '15%' },
              { label: 'Volume & Diversity', key: 'volumeDiversity', max: 85, weight: '10%' },
              { label: 'Network Trust', key: 'networkTrust', max: 85, weight: '10%' },
            ].map(({ label, key, max, weight }) => {
              const value = (score.components as any)[key] ?? 0;
              const pct = Math.round((value / max) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{label}</span>
                    <span className="text-gray-400">{value}/{max} <span className="text-gray-600">({weight})</span></span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score history */}
      {score?.history && score.history.length > 0 && (
        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
          <h2 className="font-semibold text-gray-300 mb-4">Recent Events</h2>
          <div className="space-y-2">
            {score.history.slice(0, 15).map((event: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`text-sm font-mono w-8 text-right ${Number(event.delta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Number(event.delta) >= 0 ? '+' : ''}{event.delta}
                  </div>
                  <div>
                    <div className="text-sm text-gray-300">{EVENT_LABELS[event.reason] ?? event.reason}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(Number(event.timestamp) * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-200">{event.score}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
