'use client';

import { use } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useCircle as useCircleDetail } from '@halo-protocol/sdk/react';
import { useContribute, useJoinCircle } from '../../../hooks/useContribute.js';
import type { Address } from 'viem';

const CIRCLE_ADDRESS = (process.env.NEXT_PUBLIC_CIRCLE_ADDRESS ?? '0x0') as Address;
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d') as Address;

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-gray-800 text-gray-300',
  FUNDING: 'bg-yellow-900/50 text-yellow-300',
  ACTIVE: 'bg-green-900/50 text-green-400',
  COMPLETED: 'bg-blue-900/50 text-blue-400',
  DEFAULTED: 'bg-red-900/50 text-red-400',
};

function formatUSD(amount: bigint, decimals = 6) {
  return `$${(Number(amount) / 10 ** decimals).toLocaleString()}`;
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function CircleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, isConnected } = useAccount();
  const { circle, isLoading } = useCircleDetail(BigInt(id));

  const isMember = circle?.members.some(
    (m: any) => m.member.id.toLowerCase() === address?.toLowerCase()
  );
  const myMemberInfo = circle?.members.find(
    (m: any) => m.member.id.toLowerCase() === address?.toLowerCase()
  );

  const contribute = useContribute({
    circleId: BigInt(id),
    circleAddress: CIRCLE_ADDRESS,
    tokenAddress: USDC_ADDRESS,
    contributionAmount: circle?.params.contributionAmount ?? 0n,
  });

  const join = useJoinCircle({
    circleId: BigInt(id),
    circleAddress: CIRCLE_ADDRESS,
    tokenAddress: USDC_ADDRESS,
    escrowAmount: circle
      ? circle.params.contributionAmount * BigInt(circle.params.memberCount - 1)
      : 0n,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-12 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-10 bg-gray-800 rounded w-64" />
        <div className="h-48 bg-gray-900 rounded-xl" />
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Circle #{id} not found
      </div>
    );
  }

  const currentRound = circle.rounds?.[Number(circle.currentRoundId) - 1];
  const deadline = currentRound ? new Date(Number(currentRound.deadline) * 1000) : null;
  const isOverdue = deadline && deadline < new Date();

  return (
    <div className="min-h-screen px-4 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <div className="text-sm text-gray-500 font-mono mb-1">Circle #{id}</div>
          <h1 className="text-3xl font-bold">
            {formatUSD(circle.params.contributionAmount)} / {circle.params.cycleDuration / 86400}d
          </h1>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[circle.status] ?? STATUS_BADGE.PENDING}`}>
          {circle.status}
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Stats */}
        <div className="col-span-1 p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-4">
          <h2 className="font-semibold text-gray-300">Circle Stats</h2>
          {[
            ['Members', `${circle.members.length}/${circle.params.memberCount}`],
            ['Total Pot', formatUSD(circle.params.contributionAmount * BigInt(circle.params.memberCount))],
            ['Escrow/Member', formatUSD(circle.params.contributionAmount * BigInt(circle.params.memberCount - 1))],
            ['Current Round', `${circle.currentRoundId ?? 0} / ${circle.params.memberCount}`],
            ['Grace Period', `${circle.params.gracePeriod / 3600}h`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-400">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}

          {deadline && (
            <div className={`mt-2 p-3 rounded-lg text-sm ${isOverdue ? 'bg-red-900/30 text-red-400' : 'bg-gray-800 text-gray-300'}`}>
              {isOverdue ? '⚠ Grace period active' : `Next deadline: ${deadline.toLocaleDateString()}`}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="col-span-2 p-5 rounded-xl bg-gray-900 border border-gray-800">
          <h2 className="font-semibold text-gray-300 mb-4">Members ({circle.members.length})</h2>
          <div className="space-y-2">
            {circle.members.map((m: any) => (
              <div key={m.member.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <div className="text-sm font-mono">{truncateAddr(m.member.id)}</div>
                    <div className="text-xs text-gray-500">Score: {m.member.score}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">{m.paidRounds} paid</div>
                  {m.payoutRound && (
                    <div className="text-xs text-gray-500">Payout: round {m.payoutRound}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      {isConnected ? (
        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
          <h2 className="font-semibold text-gray-300 mb-4">Actions</h2>

          {!isMember && circle.status === 'PENDING' && (
            <div>
              <p className="text-sm text-gray-400 mb-3">
                Join and deposit {formatUSD(circle.params.contributionAmount * BigInt(circle.params.memberCount - 1))} escrow (refunded on completion).
              </p>
              <button
                onClick={join.execute}
                disabled={join.isLoading}
                className="px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold transition-colors disabled:opacity-50"
              >
                {join.step === 'joining' ? 'Joining...' :
                 join.step === 'approving' ? 'Approving USDC...' :
                 join.step === 'depositing' ? 'Depositing Escrow...' :
                 join.step === 'done' ? 'Joined!' : 'Join & Deposit Escrow'}
              </button>
            </div>
          )}

          {isMember && circle.status === 'ACTIVE' && (
            <div>
              <p className="text-sm text-gray-400 mb-3">
                Contribute {formatUSD(circle.params.contributionAmount)} USDC for round {circle.currentRoundId}.
              </p>
              <button
                onClick={contribute.execute}
                disabled={contribute.isLoading}
                className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-semibold transition-colors disabled:opacity-50"
              >
                {contribute.step === 'approving' ? 'Approving...' :
                 contribute.step === 'contributing' ? 'Contributing...' :
                 contribute.step === 'done' ? 'Contributed!' : 'Contribute'}
              </button>
            </div>
          )}

          {isMember && circle.status === 'COMPLETED' && Number(myMemberInfo?.escrowRemaining ?? 0) > 0 && (
            <div className="text-sm text-gray-400">
              Escrow of {formatUSD(BigInt(myMemberInfo?.escrowRemaining ?? 0))} available to withdraw. Use the withdraw function directly.
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 text-center">
          <p className="text-gray-400 mb-4">Connect your wallet to join or contribute</p>
          <ConnectButton />
        </div>
      )}
    </div>
  );
}
