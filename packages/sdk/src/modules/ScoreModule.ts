import { GraphQLClient } from 'graphql-request';
import type {
  Address,
  CreditScore,
  CreditTier,
  ScoreComponents,
  ScoreEvent,
  CreditEventType,
} from '../types.js';
import { scoreTier } from '../types.js';
import { GET_CREDIT_SCORE } from '../graphql/queries.js';

interface SubgraphScoreResponse {
  member: {
    id: string;
    score: number;
    tier: string;
    onTimePayments: number;
    defaults: number;
    totalContributions: string;
    circlesCompleted: number;
    joinedAt: string;
    lastActivity: string;
    creditEvents: Array<{
      id: string;
      score: number;
      tier: string;
      delta: string;
      reason: string;
      timestamp: string;
    }>;
  } | null;
}

export class ScoreModule {
  constructor(private readonly gql: GraphQLClient) {}

  async get(address: Address): Promise<CreditScore> {
    const data = await this.gql.request<SubgraphScoreResponse>(GET_CREDIT_SCORE, {
      address: address.toLowerCase(),
    });

    if (!data.member) {
      // New user — return default score
      return {
        score: 500,
        tier: 'FAIR',
        percentile: 50,
        components: {
          paymentHistory: 0,
          circleCompletion: 0,
          accountAge: 0,
          volumeDiversity: 0,
          networkTrust: 0,
        },
        lastActivity: 0n,
        history: [],
      };
    }

    const m = data.member;

    return {
      score: m.score,
      tier: m.tier as CreditTier,
      percentile: this._estimatePercentile(m.score),
      components: this._buildComponents(m),
      lastActivity: BigInt(m.lastActivity),
      history: m.creditEvents.map((e) => ({
        score: e.score,
        tier: e.tier as CreditTier,
        timestamp: BigInt(e.timestamp),
        reason: e.reason as CreditEventType,
        delta: parseInt(e.delta),
      })),
    };
  }

  async meetsThreshold(address: Address, minimumScore: number): Promise<boolean> {
    const score = await this.get(address);
    return score.score >= minimumScore;
  }

  async getTier(address: Address): Promise<CreditTier> {
    const score = await this.get(address);
    return score.tier;
  }

  private _estimatePercentile(score: number): number {
    // Approximate percentile based on normal distribution around median 550
    const pctMap: Array<[number, number]> = [
      [300, 1], [400, 5], [500, 30], [550, 50],
      [600, 65], [650, 75], [700, 85], [750, 92],
      [800, 97], [850, 99],
    ];
    for (let i = pctMap.length - 1; i >= 0; i--) {
      if (score >= pctMap[i][0]) {
        if (i < pctMap.length - 1) {
          const [s0, p0] = pctMap[i];
          const [s1, p1] = pctMap[i + 1];
          return Math.round(p0 + ((score - s0) / (s1 - s0)) * (p1 - p0));
        }
        return pctMap[i][1];
      }
    }
    return 1;
  }

  private _buildComponents(m: SubgraphScoreResponse['member']): ScoreComponents {
    if (!m) return { paymentHistory: 0, circleCompletion: 0, accountAge: 0, volumeDiversity: 0, networkTrust: 0 };

    const totalPayments = m.onTimePayments + m.defaults;
    const onTimeRate = totalPayments > 0 ? m.onTimePayments / totalPayments : 0;

    return {
      paymentHistory: Math.round(onTimeRate * 340),
      circleCompletion: Math.min(m.circlesCompleted * 25, 212),
      accountAge: this._calcAgeScore(m.joinedAt),
      volumeDiversity: Math.min(Math.round((parseInt(m.totalContributions) / 1e6 / 10_000) * 85), 85),
      networkTrust: 0, // Computed from attestations
    };
  }

  private _calcAgeScore(joinedAt: string): number {
    const ageDays = (Date.now() / 1000 - parseInt(joinedAt)) / 86400;
    return Math.min(Math.round((ageDays / 365) * 127), 127);
  }
}
