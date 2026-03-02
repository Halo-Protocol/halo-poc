'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, erc20Abi, type Address } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';

// Minimal Factory ABI
const FACTORY_ABI = [
  {
    name: 'createCircle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'memberCount', type: 'uint8' },
          { name: 'contributionAmount', type: 'uint256' },
          { name: 'cycleDuration', type: 'uint32' },
          { name: 'gracePeriod', type: 'uint32' },
          { name: 'token', type: 'address' },
        ],
      },
    ],
    outputs: [{ name: 'circleId', type: 'uint256' }],
  },
] as const;

const USDC_SEPOLIA = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address;
const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_CIRCLE_FACTORY_ADDRESS ?? '0x0') as Address;

type Step = 1 | 2 | 3;

export default function CreateCirclePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [step, setStep] = useState<Step>(1);

  // Form state
  const [memberCount, setMemberCount] = useState(5);
  const [contribution, setContribution] = useState(100);
  const [cycleDays, setCycleDays] = useState(30);
  const [graceHours, setGraceHours] = useState(48);

  const escrowRequired = contribution * (memberCount - 1);
  const totalPot = contribution * memberCount;

  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const contributionUnits = parseUnits(contribution.toString(), 6);
      await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createCircle',
        args: [{
          memberCount,
          contributionAmount: contributionUnits,
          cycleDuration: cycleDays * 86400,
          gracePeriod: graceHours * 3600,
          token: USDC_SEPOLIA,
        }],
      });
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed');
      setIsCreating(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Connect to create a circle</h2>
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">Circle Created!</h2>
          <p className="text-gray-400 mb-6">Share the link with your group to fill the spots.</p>
          <button onClick={() => router.push('/circles')} className="px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 font-medium transition-colors">
            View All Circles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12 max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-2">Create a Circle</h1>
      <p className="text-gray-400 mb-8">Set up your ROSCA group parameters</p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-sky-500' : 'bg-gray-800'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Number of Members
            </label>
            <div className="flex gap-2 flex-wrap">
              {[3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setMemberCount(n)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    memberCount === n ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contribution per Cycle (USDC)
            </label>
            <div className="flex gap-2 flex-wrap">
              {[25, 50, 100, 250, 500, 1000].map((a) => (
                <button
                  key={a}
                  onClick={() => setContribution(a)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contribution === a ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setStep(2)} className="w-full py-3 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold transition-colors">
            Next: Timeline
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Cycle Duration</label>
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setCycleDays(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    cycleDays === d ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Grace Period</label>
            <div className="flex gap-2">
              {[24, 48, 72].map((h) => (
                <button
                  key={h}
                  onClick={() => setGraceHours(h)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    graceHours === h ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold transition-colors">
              Back
            </button>
            <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold transition-colors">
              Review
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-3">
            <h3 className="font-semibold text-gray-200 mb-3">Circle Summary</h3>
            {[
              ['Members', memberCount],
              ['Contribution', `$${contribution} USDC / cycle`],
              ['Total Pot', `$${totalPot} USDC`],
              ['Cycle Duration', `${cycleDays} days`],
              ['Grace Period', `${graceHours} hours`],
              ['Escrow Required', `$${escrowRequired} USDC (returned on completion)`],
              ['Protocol Fee', '1% of each payout'],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="font-medium text-white">{value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} disabled={isCreating} className="flex-1 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold transition-colors disabled:opacity-50">
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || isConfirming}
              className="flex-1 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 font-semibold transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Confirm in wallet...' : isConfirming ? 'Creating...' : 'Create Circle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
