import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { GraphQLClient } from 'graphql-request';
import { PrismaService } from '../../prisma/prisma.service.js';

const METRICS_QUERY = `
  query ProtocolMetrics {
    protocolMetrics(id: "singleton") {
      totalMembers totalCircles activeCircles completedCircles
      totalValueLocked defaultRate averageScore totalPayouts updatedAt
    }
  }
`;

const TVL_HISTORY_QUERY = `
  query TVLHistory($first: Int) {
    dailyMetrics(orderBy: date, orderDirection: desc, first: $first) {
      date totalValueLocked activeCircles totalPayouts
    }
  }
`;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly gql: GraphQLClient;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.gql = new GraphQLClient(config.get('SUBGRAPH_URL_SEPOLIA', ''));
  }

  async getProtocolMetrics() {
    const cacheKey = 'analytics:metrics';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.gql.request<{ protocolMetrics: any }>(METRICS_QUERY);
      const m = data.protocolMetrics ?? this._emptyMetrics();
      await this.cache.set(cacheKey, m, 30_000); // 30s cache
      return m;
    } catch (e) {
      // Fallback to DB snapshot
      const snapshot = await this.prisma.metricsSnapshot.findFirst({
        orderBy: { snapshotAt: 'desc' },
      });
      return snapshot ?? this._emptyMetrics();
    }
  }

  async getTVLHistory(days = 30) {
    const cacheKey = `analytics:tvl:${days}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const data = await this.gql.request<{ dailyMetrics: any[] }>(TVL_HISTORY_QUERY, { first: days });
    const result = data.dailyMetrics ?? [];
    await this.cache.set(cacheKey, result, 5 * 60_000); // 5min cache
    return result;
  }

  async getMilestoneStatus() {
    const metrics = await this.getProtocolMetrics();
    return {
      M1: {
        achieved: metrics.totalMembers >= 50 && metrics.totalCircles >= 20,
        targets: { members: 50, circles: 20 },
        actual: { members: metrics.totalMembers, circles: metrics.totalCircles },
      },
      M2: {
        achieved: metrics.totalMembers >= 50 &&
          BigInt(metrics.totalValueLocked) >= 10_000n * 10n ** 6n &&
          parseFloat(metrics.defaultRate) < 0.05,
        targets: { members: 50, tvl: 10000, defaultRate: 0.05 },
        actual: {
          members: metrics.totalMembers,
          tvl: Number(BigInt(metrics.totalValueLocked)) / 1e6,
          defaultRate: parseFloat(metrics.defaultRate),
        },
      },
    };
  }

  private _emptyMetrics() {
    return {
      totalMembers: 0, totalCircles: 0, activeCircles: 0,
      completedCircles: 0, totalValueLocked: '0',
      defaultRate: '0', averageScore: 500, totalPayouts: '0',
    };
  }
}
