'use client';

import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useHaloScore, useUserCircles, useProtocolMetrics } from '@halo-protocol/sdk/react';
import { SCORE_TIERS } from '@halo-protocol/sdk';
import type { Address } from '@halo-protocol/sdk';

export default function DashboardPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-8">Connect to view your Halo Score and circles</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return <DashboardContent address={address as Address} />;
}

function DashboardContent({ address }: { address: Address }) {
  const { score, isLoading: scoreLoading } = useHaloScore(address);
  const { circles, isLoading: circlesLoading } = useUserCircles(address);
  const { metrics } = useProtocolMetrics();

  const tierColor: Record<string, string> = {
    POOR: 'text-red-400',
    FAIR: 'text-orange-400',
    GOOD: 'text-yellow-400',
    VERY_GOOD: 'text-green-400',
    EXCEPTIONAL: 'text-indigo-400',
  };

  return (
    <div className="min-h-screen px-4 py-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <ConnectButton />
      </div>

      {/* Score Card */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="col-span-1 p-8 rounded-2xl bg-gray-900 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Halo Score</div>
          {scoreLoading ? (
            <div className="h-16 bg-gray-800 animate-pulse rounded" />
          ) : (
            <>
              <div className={`text-6xl font-bold mb-2 ${tierColor[score?.tier ?? 'FAIR']}`}>
                {score?.score ?? 500}
              </div>
              <div className={`text-lg font-medium ${tierColor[score?.tier ?? 'FAIR']}`}>
                {SCORE_TIERS[score?.tier ?? 'FAIR']?.label ?? 'Fair'}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Top {100 - (score?.percentile ?? 50)}% of users
              </div>
            </>
          )}
        </div>

        <div className="col-span-2 p-6 rounded-2xl bg-gray-900 border border-gray-800">
          <div className="text-sm text-gray-400 mb-4">Score Components</div>
          {scoreLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-gray-800 animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Payment History', value: score?.components.paymentHistory ?? 0, max: 340, pct: '40%' },
                { label: 'Circle Completion', value: score?.components.circleCompletion ?? 0, max: 212, pct: '25%' },
                { label: 'Account Age', value: score?.components.accountAge ?? 0, max: 127, pct: '15%' },
                { label: 'Volume & Diversity', value: score?.components.volumeDiversity ?? 0, max: 85, pct: '10%' },
                { label: 'Network Trust', value: score?.components.networkTrust ?? 0, max: 85, pct: '10%' },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-3">
                  <div className="w-36 text-sm text-gray-400">{c.label}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div
                      className="h-2 bg-halo-500 rounded-full transition-all"
                      style={{ width: `${(c.value / c.max) * 100}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-400 w-12 text-right">{c.pct}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Circles */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">My Circles</h2>
          <a href="/circles/create" className="px-4 py-2 rounded-lg bg-halo-500 hover:bg-halo-600 text-sm font-medium transition-colors">
            + Create Circle
          </a>
        </div>

        {circlesLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-800 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : circles.length === 0 ? (
          <div className="p-8 rounded-xl bg-gray-900 border border-gray-800 text-center text-gray-400">
            No circles yet. Join one to start building your score!
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {circles.map((c) => (
              <a
                key={c.id.toString()}
                href={`/circles/${c.id}`}
                className="p-6 rounded-xl bg-gray-900 border border-gray-800 hover:border-halo-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Circle #{c.id.toString()}</div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    c.status === 'ACTIVE' ? 'bg-green-900 text-green-400' :
                    c.status === 'COMPLETED' ? 'bg-blue-900 text-blue-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {c.status}
                  </span>
                </div>
                <div className="text-sm text-gray-400">
                  {c.members.length}/{c.params.memberCount} members •{' '}
                  ${(Number(c.params.contributionAmount) / 1e6).toFixed(0)}/month
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Protocol Stats */}
      {metrics && (
        <div className="p-6 rounded-xl bg-gray-900 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4">Protocol Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-halo-400">{metrics.totalMembers}</div>
              <div className="text-sm text-gray-400">Total Members</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-halo-400">{metrics.activeCircles}</div>
              <div className="text-sm text-gray-400">Active Circles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-halo-400">
                ${(Number(metrics.totalValueLocked) / 1e6).toFixed(0)}
              </div>
              <div className="text-sm text-gray-400">TVL</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-halo-400">
                {(metrics.defaultRate * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400">Default Rate</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
