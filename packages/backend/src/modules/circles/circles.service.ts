import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { GraphQLClient } from 'graphql-request';

const GET_CIRCLES_QUERY = `
  query GetCircles($status: String, $first: Int, $skip: Int) {
    circles(
      where: { status: $status }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      id status creator { id }
      memberCount contributionAmount token
      cycleDuration gracePeriod tvl
      members { member { id score tier } isActive payoutRound paidRounds }
      createdAt completedAt
    }
  }
`;

const GET_CIRCLE_QUERY = `
  query GetCircle($id: ID!) {
    circle(id: $id) {
      id status creator { id }
      memberCount contributionAmount token
      cycleDuration gracePeriod currentRoundId tvl
      members { member { id score tier } isActive payoutRound paidRounds escrowRemaining hasDeposited }
      rounds(orderBy: roundId) {
        roundId recipient { id } deadline graceDeadline totalCollected payoutClaimed
      }
      createdAt activatedAt completedAt
    }
  }
`;

@Injectable()
export class CirclesService {
  private readonly logger = new Logger(CirclesService.name);
  private readonly gql: GraphQLClient;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.gql = new GraphQLClient(config.get('SUBGRAPH_URL_SEPOLIA', ''));
  }

  async list(status?: string, page = 1, limit = 20) {
    const cacheKey = `circles:list:${status ?? 'all'}:${page}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const data = await this.gql.request<{ circles: any[] }>(GET_CIRCLES_QUERY, {
      status: status || null,
      first: limit,
      skip,
    });

    const result = { circles: data.circles ?? [], page, limit };
    await this.cache.set(cacheKey, result, 15_000); // 15s cache
    return result;
  }

  async getById(circleId: string) {
    const cacheKey = `circles:detail:${circleId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const data = await this.gql.request<{ circle: any }>(GET_CIRCLE_QUERY, { id: circleId });
    if (!data.circle) throw new NotFoundException(`Circle ${circleId} not found`);

    await this.cache.set(cacheKey, data.circle, 10_000); // 10s cache
    return data.circle;
  }

  async getMembers(circleId: string) {
    const circle = await this.getById(circleId);
    return circle.members ?? [];
  }

  async getRounds(circleId: string) {
    const circle = await this.getById(circleId);
    return circle.rounds ?? [];
  }

  async invalidateCache(circleId: string) {
    await this.cache.del(`circles:detail:${circleId}`);
    await this.cache.del(`circles:list:all:1:20`);
  }
}
