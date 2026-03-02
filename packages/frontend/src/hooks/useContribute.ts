'use client';

import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, erc20Abi, type Address } from 'viem';
import { useState, useCallback } from 'react';

// Minimal Circle ABI for contribute + approve
const CIRCLE_ABI = [
  {
    name: 'contribute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'circleId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'depositEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'circleId', type: 'uint256' }],
    outputs: [],
  },
] as const;

interface UseContributeParams {
  circleId: bigint;
  circleAddress: Address;
  tokenAddress: Address;
  contributionAmount: bigint;
}

/**
 * Hook for approving + contributing to a circle.
 * Handles the ERC20 approve → contribute flow.
 */
export function useContribute({
  circleId,
  circleAddress,
  tokenAddress,
  contributionAmount,
}: UseContributeParams) {
  const [step, setStep] = useState<'idle' | 'approving' | 'contributing' | 'done' | 'error'>('idle');

  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: contribute, data: contributeTxHash } = useWriteContract();
  const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({
    hash: contributeTxHash,
  });

  const execute = useCallback(async () => {
    setStep('approving');
    try {
      // 1. Approve token spend
      await approve({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [circleAddress, contributionAmount],
      });

      // 2. Contribute
      setStep('contributing');
      await contribute({
        address: circleAddress,
        abi: CIRCLE_ABI,
        functionName: 'contribute',
        args: [circleId],
      });

      setStep('done');
    } catch (e) {
      setStep('error');
      throw e;
    }
  }, [approve, contribute, circleId, circleAddress, tokenAddress, contributionAmount]);

  return {
    execute,
    step,
    isLoading: step === 'approving' || step === 'contributing' || isWaiting,
    isSuccess: isSuccess || step === 'done',
    txHash: contributeTxHash,
  };
}

/**
 * Hook for join + deposit escrow flow.
 */
export function useJoinCircle({
  circleId,
  circleAddress,
  tokenAddress,
  escrowAmount,
}: {
  circleId: bigint;
  circleAddress: Address;
  tokenAddress: Address;
  escrowAmount: bigint;
}) {
  const [step, setStep] = useState<'idle' | 'joining' | 'approving' | 'depositing' | 'done' | 'error'>('idle');

  const { writeContractAsync } = useWriteContract();

  const execute = useCallback(async () => {
    try {
      // 1. Join circle
      setStep('joining');
      await writeContractAsync({
        address: circleAddress,
        abi: [{ name: 'join', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'circleId', type: 'uint256' }], outputs: [] }] as const,
        functionName: 'join',
        args: [circleId],
      });

      // 2. Approve escrow amount
      setStep('approving');
      await writeContractAsync({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [circleAddress, escrowAmount],
      });

      // 3. Deposit escrow
      setStep('depositing');
      await writeContractAsync({
        address: circleAddress,
        abi: CIRCLE_ABI,
        functionName: 'depositEscrow',
        args: [circleId],
      });

      setStep('done');
    } catch (e) {
      setStep('error');
      throw e;
    }
  }, [writeContractAsync, circleId, circleAddress, tokenAddress, escrowAmount]);

  return {
    execute,
    step,
    isLoading: ['joining', 'approving', 'depositing'].includes(step),
    isSuccess: step === 'done',
  };
}
