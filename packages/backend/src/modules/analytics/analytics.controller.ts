import { Controller, Get, Query, DefaultValuePipe, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { Public } from '../auth/public.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';

@Controller('metrics')
@UseGuards(JwtGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** GET /api/v1/metrics — Protocol-wide stats */
  @Public()
  @Get()
  getMetrics() {
    return this.analytics.getProtocolMetrics();
  }

  /** GET /api/v1/metrics/tvl?days=30 — TVL history */
  @Public()
  @Get('tvl')
  getTVL(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.analytics.getTVLHistory(Math.min(days, 365));
  }

  /** GET /api/v1/metrics/milestones — Grant milestone tracking */
  @Public()
  @Get('milestones')
  getMilestones() {
    return this.analytics.getMilestoneStatus();
  }
}
