import { GraphQLClient } from 'graphql-request';
import {
  type HaloConfig,
  type ContractAddresses,
  type ProtocolMetrics,
  type MilestoneStatus,
  KNOWN_ADDRESSES,
  SUBGRAPH_URLS,
} from './types.js';
import { ScoreModule } from './modules/ScoreModule.js';
import { CircleModule } from './modules/CircleModule.js';
import { GET_PROTOCOL_METRICS, VERIFY_MILESTONE } from './graphql/queries.js';

/**
 * HaloSDK — Main entry point for the Halo Protocol SDK.
 *
 * Zero DOM dependencies — works in Node.js, browsers, and React Native.
 *
 * @example
 * ```typescript
 * import { HaloSDK } from '@halo-protocol/sdk';
 *
 * const halo = new HaloSDK({ chainId: 421614 });
 *
 * const score = await halo.scores.get('0x...');
 * // { score: 720, tier: 'Good', percentile: 85, ... }
 *
 * const circles = await halo.circles.list({ status: 'PENDING' });
 * ```
 */
export class HaloSDK {
  readonly config: HaloConfig;
  readonly contracts: ContractAddresses;
  readonly scores: ScoreModule;
  readonly circles: CircleModule;

  private readonly gql: GraphQLClient;

  constructor(config: HaloConfig) {
    this.config = config;

    // Resolve contract addresses
    const defaults = KNOWN_ADDRESSES[config.chainId];
    this.contracts = {
      ...defaults,
      ...config.contracts,
    };

    // Setup GraphQL client
    const subgraphUrl = config.subgraphUrl ?? SUBGRAPH_URLS[config.chainId];
    this.gql = new GraphQLClient(subgraphUrl);

    // Initialize modules
    this.scores = new ScoreModule(this.gql);
    this.circles = new CircleModule(this.gql);
  }

  /**
   * Get protocol-wide metrics
   */
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    const data = await this.gql.request<{ protocolMetrics: any }>(GET_PROTOCOL_METRICS);
    const m = data.protocolMetrics;

    if (!m) {
      return {
        totalMembers: 0,
        totalCircles: 0,
        activeCircles: 0,
        completedCircles: 0,
        totalValueLocked: 0n,
        defaultRate: 0,
        averageScore: 500,
        totalPayouts: 0n,
      };
    }

    return {
      totalMembers: m.totalMembers,
      totalCircles: m.totalCircles,
      activeCircles: m.activeCircles,
      completedCircles: m.completedCircles,
      totalValueLocked: BigInt(m.totalValueLocked),
      defaultRate: parseFloat(m.defaultRate),
      averageScore: m.averageScore,
      totalPayouts: BigInt(m.totalPayouts),
    };
  }

  /**
   * Verify a grant milestone
   * @param milestone - 'M1' | 'M2' | 'M3' | 'M4'
   */
  async verifyMilestone(milestone: 'M1' | 'M2' | 'M3' | 'M4'): Promise<MilestoneStatus> {
    const metrics = await this.getProtocolMetrics();

    const targets: Record<string, (m: ProtocolMetrics) => boolean> = {
      M1: (m) => m.totalMembers >= 50 && m.totalCircles >= 20,
      M2: (m) => m.totalMembers >= 50 && m.totalValueLocked >= 10_000n * 10n ** 6n && m.defaultRate < 0.05,
      M3: (m) => m.totalMembers >= 100 && m.totalValueLocked >= 25_000n * 10n ** 6n && m.defaultRate < 0.03,
      M4: (m) => m.totalMembers >= 150 && m.totalValueLocked >= 50_000n * 10n ** 6n,
    };

    return {
      achieved: targets[milestone](metrics),
      metrics,
      blockNumber: 0n, // Would fetch from chain
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };
  }
}
