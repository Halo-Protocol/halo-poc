import { GraphQLClient } from 'graphql-request';
import type { Address, Circle, CircleParams, CircleStatus, Round } from '../types.js';
import { GET_CIRCLE, GET_CIRCLES, GET_USER_CIRCLES } from '../graphql/queries.js';

export class CircleModule {
  constructor(private readonly gql: GraphQLClient) {}

  async get(circleId: bigint): Promise<Circle | null> {
    const data = await this.gql.request<{ circle: any }>(GET_CIRCLE, {
      circleId: circleId.toString(),
    });
    if (!data.circle) return null;
    return this._parseCircle(data.circle);
  }

  async list(options?: { status?: CircleStatus; first?: number; skip?: number }): Promise<Circle[]> {
    const data = await this.gql.request<{ circles: any[] }>(GET_CIRCLES, {
      status: options?.status ?? null,
      first: options?.first ?? 20,
      skip: options?.skip ?? 0,
    });
    return data.circles.map(this._parseCircle);
  }

  async getForUser(address: Address): Promise<Circle[]> {
    const data = await this.gql.request<{ member: { circles: any[] } | null }>(GET_USER_CIRCLES, {
      address: address.toLowerCase(),
    });
    if (!data.member) return [];
    return data.member.circles.map((cm: any) => this._parseCircle(cm.circle));
  }

  private _parseCircle(c: any): Circle {
    return {
      id: BigInt(c.id),
      status: c.status as CircleStatus,
      creator: c.creator.id as Address,
      params: {
        memberCount: c.memberCount,
        contributionAmount: BigInt(c.contributionAmount),
        cycleDuration: parseInt(c.cycleDuration),
        gracePeriod: parseInt(c.gracePeriod),
        token: c.token as Address,
      },
      members: (c.members || []).map((m: any) => ({
        address: m.member.id as Address,
        hasDeposited: m.hasDeposited,
        isActive: m.isActive,
        payoutRound: m.payoutRound,
        paidRounds: m.paidRounds,
        escrowRemaining: BigInt(m.escrowRemaining),
      })),
      currentRoundId: BigInt(c.currentRoundId ?? 0),
      startTime: BigInt(c.startTime ?? 0),
      totalValueLocked: BigInt(c.tvl ?? 0),
    };
  }
}
