'use client';

import type { Address } from 'viem';
import { useContribute, useJoinCircle } from '../../hooks/useContribute.js';

interface ContributeButtonProps {
  circleId: bigint;
  circleAddress: Address;
  tokenAddress: Address;
  contributionAmount: bigint;
}

export function ContributeButton({
  circleId,
  circleAddress,
  tokenAddress,
  contributionAmount,
}: ContributeButtonProps) {
  const { execute, step, isLoading } = useContribute({
    circleId,
    circleAddress,
    tokenAddress,
    contributionAmount,
  });

  return (
    <button
      onClick={execute}
      disabled={isLoading}
      className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 font-semibold transition-colors disabled:opacity-50"
    >
      {step === 'approving'
        ? 'Approving...'
        : step === 'contributing'
          ? 'Contributing...'
          : step === 'done'
            ? 'Contributed!'
            : 'Contribute'}
    </button>
  );
}

interface JoinCircleButtonProps {
  circleId: bigint;
  circleAddress: Address;
  tokenAddress: Address;
  escrowAmount: bigint;
}

export function JoinCircleButton({
  circleId,
  circleAddress,
  tokenAddress,
  escrowAmount,
}: JoinCircleButtonProps) {
  const { execute, step, isLoading } = useJoinCircle({
    circleId,
    circleAddress,
    tokenAddress,
    escrowAmount,
  });

  return (
    <button
      onClick={execute}
      disabled={isLoading}
      className="px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold transition-colors disabled:opacity-50"
    >
      {step === 'joining'
        ? 'Joining...'
        : step === 'approving'
          ? 'Approving USDC...'
          : step === 'depositing'
            ? 'Depositing Escrow...'
            : step === 'done'
              ? 'Joined!'
              : 'Join & Deposit Escrow'}
    </button>
  );
}
