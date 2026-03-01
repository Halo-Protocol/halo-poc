import {
  Controller, Get, Param, Query, ParseIntPipe,
  DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { CirclesService } from './circles.service.js';
import { Public } from '../auth/public.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';

@Controller('circles')
@UseGuards(JwtGuard)
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  /**
   * GET /api/v1/circles?status=ACTIVE&page=1&limit=20
   */
  @Public()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.circles.list(status, page, Math.min(limit, 100));
  }

  /**
   * GET /api/v1/circles/:id
   */
  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.circles.getById(id);
  }

  /**
   * GET /api/v1/circles/:id/members
   */
  @Public()
  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.circles.getMembers(id);
  }

  /**
   * GET /api/v1/circles/:id/rounds
   */
  @Public()
  @Get(':id/rounds')
  getRounds(@Param('id') id: string) {
    return this.circles.getRounds(id);
  }
}
