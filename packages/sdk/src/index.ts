// =============================================================================
// @halo-protocol/sdk — Public API
// =============================================================================

export { HaloSDK } from './HaloSDK.js';
export { ScoreModule } from './modules/ScoreModule.js';
export { CircleModule } from './modules/CircleModule.js';

export type {
  HaloConfig,
  ContractAddresses,
  ChainId,
  Address,
  HexString,
  Circle,
  CircleParams,
  CircleStatus,
  CircleMember,
  Round,
  CreditScore,
  CreditTier,
  CreditEventType,
  ScoreComponents,
  ScoreEvent,
  Attestation,
  AttestationType,
  ProtocolMetrics,
  MilestoneStatus,
} from './types.js';

export { CHAIN_IDS, SCORE_TIERS, KNOWN_ADDRESSES, SUBGRAPH_URLS, scoreTier } from './types.js';
