'use client';

import Link from 'next/link';

interface CircleCardProps {
  id: string;
  status: string;
  memberCount: number;
  currentMembers: number;
  contributionAmount: bigint; // in token units (6 decimals)
  token: string;
  cycleDuration: number; // seconds
  tvl: bigint;
  creator: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-800 text-gray-300',
  FUNDING: 'bg-yellow-900/50 text-yellow-300',
  ACTIVE: 'bg-green-900/50 text-green-400',
  COMPLETED: 'bg-blue-900/50 text-blue-400',
  DEFAULTED: 'bg-red-900/50 text-red-400',
  CANCELLED: 'bg-gray-800 text-gray-500',
};

function formatUSD(amount: bigint, decimals = 6): string {
  return `$${(Number(amount) / 10 ** decimals).toLocaleString()}`;
}

function formatCycle(seconds: number): string {
  if (seconds >= 30 * 86400) return '30 days';
  if (seconds >= 14 * 86400) return '14 days';
  if (seconds >= 7 * 86400) return '7 days';
  return `${seconds / 86400} days`;
}

export function CircleCard({
  id, status, memberCount, currentMembers,
  contributionAmount, cycleDuration, tvl, creator,
}: CircleCardProps) {
  const isFull = currentMembers >= memberCount;
  const canJoin = status === 'PENDING' && !isFull;

  return (
    <Link href={`/circles/${id}`} className="block">
      <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-600 transition-all hover:shadow-lg hover:shadow-black/20">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-gray-500 font-mono mb-1">Circle #{id}</div>
            <div className="text-xl font-bold text-white">
              {formatUSD(contributionAmount)}<span className="text-sm text-gray-400 font-normal"> / cycle</span>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.CANCELLED}`}>
            {status}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Members</div>
            <div className="text-sm font-medium">
              <span className={isFull ? 'text-red-400' : 'text-white'}>{currentMembers}</span>
              <span className="text-gray-500">/{memberCount}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Cycle</div>
            <div className="text-sm font-medium text-white">{formatCycle(cycleDuration)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Total Pot</div>
            <div className="text-sm font-medium text-white">
              {formatUSD(contributionAmount * BigInt(memberCount))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">TVL</div>
            <div className="text-sm font-medium text-white">{formatUSD(tvl)}</div>
          </div>
        </div>

        {/* Members progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Members filled</span>
            <span>{Math.round((currentMembers / memberCount) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all"
              style={{ width: `${(currentMembers / memberCount) * 100}%` }}
            />
          </div>
        </div>

        {/* CTA */}
        {canJoin && (
          <div className="text-center mt-3">
            <span className="text-sm font-medium text-sky-400">
              {memberCount - currentMembers} spot{memberCount - currentMembers !== 1 ? 's' : ''} left — Join
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
