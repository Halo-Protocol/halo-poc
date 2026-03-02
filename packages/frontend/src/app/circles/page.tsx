'use client';

import { useState } from 'react';
import { useCircles } from '@halo-protocol/sdk/react';
import { CircleCard } from '../../components/circles/CircleCard.js';

type FilterStatus = 'ALL' | 'PENDING' | 'ACTIVE' | 'COMPLETED';

export default function CirclesPage() {
  const [status, setStatus] = useState<FilterStatus>('ALL');
  const { circles, isLoading } = useCircles(status === 'ALL' ? undefined : { status });

  return (
    <div className="min-h-screen px-4 py-12 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Circles</h1>
          <p className="text-gray-400 mt-1">Join a ROSCA circle to start building your credit score</p>
        </div>
        <a
          href="/circles/create"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-semibold transition-colors"
        >
          + Create Circle
        </a>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['ALL', 'PENDING', 'ACTIVE', 'COMPLETED'] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              status === f
                ? 'bg-sky-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : circles.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-gray-400 mb-4">No circles found</div>
          <a href="/circles/create" className="text-sky-400 hover:text-sky-300 text-sm">
            Be the first to create one
          </a>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {circles.map((c) => (
            <CircleCard
              key={c.id.toString()}
              id={c.id.toString()}
              status={c.status}
              memberCount={c.params.memberCount}
              currentMembers={c.members.length}
              contributionAmount={c.params.contributionAmount}
              token={c.params.token}
              cycleDuration={c.params.cycleDuration}
              tvl={c.tvl ?? 0n}
              creator={c.creator}
            />
          ))}
        </div>
      )}
    </div>
  );
}
