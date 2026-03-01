// =============================================================================
// HALO PROTOCOL SDK — Type Definitions
// =============================================================================

export type Address = `0x${string}`;
export type HexString = `0x${string}`;

// -----------------------------------------------------------------------------
// CHAIN CONFIG
// -----------------------------------------------------------------------------

export const CHAIN_IDS = {
  ARBITRUM_SEPOLIA: 421614,
  ARBITRUM_ONE: 42161,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export interface HaloConfig {
  chainId: ChainId;
  /** ethers/viem provider or RPC URL */
  rpcUrl?: string;
  /** The Graph subgraph URL */
  subgraphUrl?: string;
  /** Backend API URL */
  apiUrl?: string;
  /** Contract addresses (auto-loaded from chainId if not provided) */
  contracts?: Partial<ContractAddresses>;
}

export interface ContractAddresses {
  circleFactory: Address;
  circle: Address;
  creditScore: Address;
  attestations: Address;
  escrow: Address;
  penaltyEngine: Address;
  reserveFund: Address;
  usdc: Address;
}

// -----------------------------------------------------------------------------
// CIRCLE TYPES
// -----------------------------------------------------------------------------

export type CircleStatus = 'PENDING' | 'FUNDING' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';

export interface CircleParams {
  memberCount: number; // 3–10
  contributionAmount: bigint; // In token base units (e.g., 100_000_000n for $100 USDC)
  cycleDuration: number; // Seconds (7–30 days)
  gracePeriod: number; // Seconds (24–72 hours)
  token: Address;
}

export interface Circle {
  id: bigint;
  status: CircleStatus;
  creator: Address;
  params: CircleParams;
  members: CircleMember[];
  currentRoundId: bigint;
  startTime: bigint;
  totalValueLocked: bigint;
}

export interface CircleMember {
  address: Address;
  hasDeposited: boolean;
  isActive: boolean;
  payoutRound: number;
  paidRounds: number;
  escrowRemaining: bigint;
}

export interface Round {
  roundId: bigint;
  recipient: Address;
  deadline: bigint;
  graceDeadline: bigint;
  totalCollected: bigint;
  payoutClaimed: boolean;
}

// -----------------------------------------------------------------------------
// CREDIT SCORE TYPES
// -----------------------------------------------------------------------------

export type CreditTier = 'POOR' | 'FAIR' | 'GOOD' | 'VERY_GOOD' | 'EXCEPTIONAL';

export type CreditEventType =
  | 'ON_TIME_PAYMENT'
  | 'EARLY_PAYMENT'
  | 'GRACE_PERIOD_PAYMENT'
  | 'SOFT_DEFAULT'
  | 'HARD_DEFAULT'
  | 'CIRCLE_COMPLETION'
  | 'STREAK_3_MONTH'
  | 'STREAK_6_MONTH'
  | 'STREAK_12_MONTH'
  | 'VOUCH_RECEIVED'
  | 'FRAUD_REPORT'
  | 'INACTIVITY_DECAY';

export interface CreditScore {
  score: number;
  tier: CreditTier;
  percentile: number;
  components: ScoreComponents;
  lastActivity: bigint;
  history: ScoreEvent[];
}

export interface ScoreComponents {
  paymentHistory: number; // 0–340
  circleCompletion: number; // 0–212
  accountAge: number; // 0–127
  volumeDiversity: number; // 0–85
  networkTrust: number; // 0–85
}

export interface ScoreEvent {
  score: number;
  tier: CreditTier;
  timestamp: bigint;
  reason: CreditEventType;
  delta: number;
}

// -----------------------------------------------------------------------------
// ATTESTATION TYPES
// -----------------------------------------------------------------------------

export type AttestationType = 'VOUCH' | 'CIRCLE_COMPLETE' | 'WARN' | 'FRAUD_REPORT';

export interface Attestation {
  uid: HexString;
  type: AttestationType;
  attester: Address;
  recipient: Address;
  timestamp: bigint;
  revoked: boolean;
  data: HexString;
}

// -----------------------------------------------------------------------------
// PROTOCOL METRICS
// -----------------------------------------------------------------------------

export interface ProtocolMetrics {
  totalMembers: number;
  totalCircles: number;
  activeCircles: number;
  completedCircles: number;
  totalValueLocked: bigint;
  defaultRate: number;
  averageScore: number;
  totalPayouts: bigint;
}

export interface MilestoneStatus {
  achieved: boolean;
  metrics: ProtocolMetrics;
  blockNumber: bigint;
  timestamp: bigint;
}

// -----------------------------------------------------------------------------
// TIER BOUNDARIES (read-only constants)
// -----------------------------------------------------------------------------

export const SCORE_TIERS: Record<CreditTier, { min: number; max: number; label: string }> = {
  POOR: { min: 300, max: 579, label: 'Poor' },
  FAIR: { min: 580, max: 669, label: 'Fair' },
  GOOD: { min: 670, max: 739, label: 'Good' },
  VERY_GOOD: { min: 740, max: 799, label: 'Very Good' },
  EXCEPTIONAL: { min: 800, max: 850, label: 'Exceptional' },
} as const;

export function scoreTier(score: number): CreditTier {
  if (score >= 800) return 'EXCEPTIONAL';
  if (score >= 740) return 'VERY_GOOD';
  if (score >= 670) return 'GOOD';
  if (score >= 580) return 'FAIR';
  return 'POOR';
}

// -----------------------------------------------------------------------------
// KNOWN ADDRESSES
// -----------------------------------------------------------------------------

export const KNOWN_ADDRESSES: Record<ChainId, ContractAddresses> = {
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: {
    circleFactory: '0x0000000000000000000000000000000000000000', // TBD after deploy
    circle: '0x0000000000000000000000000000000000000000',
    creditScore: '0x0000000000000000000000000000000000000000',
    attestations: '0x0000000000000000000000000000000000000000',
    escrow: '0x0000000000000000000000000000000000000000',
    penaltyEngine: '0x0000000000000000000000000000000000000000',
    reserveFund: '0x0000000000000000000000000000000000000000',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  [CHAIN_IDS.ARBITRUM_ONE]: {
    circleFactory: '0x0000000000000000000000000000000000000000', // TBD after mainnet deploy
    circle: '0x0000000000000000000000000000000000000000',
    creditScore: '0x0000000000000000000000000000000000000000',
    attestations: '0x0000000000000000000000000000000000000000',
    escrow: '0x0000000000000000000000000000000000000000',
    penaltyEngine: '0x0000000000000000000000000000000000000000',
    reserveFund: '0x0000000000000000000000000000000000000000',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
};

export const SUBGRAPH_URLS: Record<ChainId, string> = {
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'https://api.thegraph.com/subgraphs/name/halo-protocol/sepolia',
  [CHAIN_IDS.ARBITRUM_ONE]: 'https://api.thegraph.com/subgraphs/name/halo-protocol/mainnet',
};
