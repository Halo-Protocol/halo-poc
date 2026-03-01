import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLClient } from 'graphql-request';

const GET_SCORE_QUERY = `
  query GetScore($address: ID!) {
    member(id: $address) {
      id
      score
      tier
      onTimePayments
      defaults
      totalContributions
      circlesCompleted
      joinedAt
      lastActivity
      creditEvents(orderBy: timestamp, orderDirection: desc, first: 50) {
        id
        score
        delta
        reason
        timestamp
        txHash
      }
    }
  }
`;

@Injectable()
export class ScoresService {
  private readonly logger = new Logger(ScoresService.name);
  private readonly gql: GraphQLClient;

  constructor(private readonly config: ConfigService) {
    const subgraphUrl = config.get<string>('SUBGRAPH_URL_SEPOLIA', '');
    this.gql = new GraphQLClient(subgraphUrl);
  }

  async getScore(address: string) {
    try {
      const data = await this.gql.request<{ member: any }>(GET_SCORE_QUERY, {
        address: address.toLowerCase(),
      });

      if (!data.member) {
        return {
          address,
          score: 500,
          tier: 'FAIR',
          percentile: 50,
          initialized: false,
        };
      }

      const m = data.member;
      return {
        address,
        score: m.score,
        tier: m.tier,
        percentile: this.estimatePercentile(m.score),
        totalContributions: m.totalContributions,
        onTimePayments: m.onTimePayments,
        defaults: m.defaults,
        circlesCompleted: m.circlesCompleted,
        joinedAt: m.joinedAt,
        lastActivity: m.lastActivity,
        initialized: true,
      };
    } catch (error) {
      this.logger.error(`Failed to get score for ${address}`, error);
      throw error;
    }
  }

  async getHistory(address: string, limit: number) {
    const data = await this.gql.request<{ member: any }>(GET_SCORE_QUERY, {
      address: address.toLowerCase(),
    });
    return data.member?.creditEvents?.slice(0, limit) ?? [];
  }

  async getTier(address: string) {
    const score = await this.getScore(address);
    return { address, tier: score.tier, score: score.score };
  }

  private estimatePercentile(score: number): number {
    if (score >= 800) return 97;
    if (score >= 740) return 90;
    if (score >= 670) return 80;
    if (score >= 580) return 60;
    if (score >= 500) return 45;
    return 20;
  }
}
