import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ScoresService } from './scores.service';

@ApiTags('Credit Scores')
@Controller('scores')
export class ScoresController {
  constructor(private readonly scoresService: ScoresService) {}

  @Get(':address')
  @ApiOperation({ summary: 'Get credit score for address' })
  @ApiParam({ name: 'address', description: 'Ethereum address (0x...)' })
  async getScore(@Param('address') address: string) {
    return this.scoresService.getScore(address);
  }

  @Get(':address/history')
  @ApiOperation({ summary: 'Get score event history' })
  async getHistory(
    @Param('address') address: string,
    @Query('limit') limit = 50,
  ) {
    return this.scoresService.getHistory(address, limit);
  }

  @Get(':address/tier')
  @ApiOperation({ summary: 'Get credit tier only' })
  async getTier(@Param('address') address: string) {
    return this.scoresService.getTier(address);
  }
}
