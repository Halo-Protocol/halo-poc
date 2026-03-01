import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createWalletClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { GraphQLClient } from 'graphql-request';

const GET_OVERDUE_QUERY = `
  query GetOverdueMembers($now: BigInt!) {
    rounds(
      where: {
        graceDeadline_lt: $now
        payoutClaimed: false
      }
      first: 50
    ) {
      circle {
        id
      }
      roundId
      circle {
        members(where: { isActive: true }) {
          member { id }
        }
      }
    }
  }
`;

const CIRCLE_ABI = parseAbi([
  'function triggerDefault(uint256 circleId, address member) external',
  'function hasContributed(uint256 circleId, uint256 roundId, address member) external view returns (bool)',
]);

@Injectable()
export class GracePeriodJob {
  private readonly logger = new Logger(GracePeriodJob.name);

  constructor(private readonly config: ConfigService) {}

  // Run every 5 minutes
  @Cron('*/5 * * * *')
  async checkGracePeriods(): Promise<void> {
    this.logger.debug('Checking grace periods...');

    try {
      const gql = new GraphQLClient(this.config.get('SUBGRAPH_URL_SEPOLIA', ''));
      const now = Math.floor(Date.now() / 1000);

      const data = await gql.request<{ rounds: any[] }>(GET_OVERDUE_QUERY, {
        now: now.toString(),
      });

      if (data.rounds.length === 0) return;

      const privateKey = this.config.get<`0x${string}`>('PRIVATE_KEY');
      const circleAddress = this.config.get<`0x${string}`>('CIRCLE_ADDRESS');

      if (!privateKey || !circleAddress) return;

      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(this.config.get('ARBITRUM_SEPOLIA_RPC')),
      });

      for (const round of data.rounds) {
        for (const cm of round.circle.members) {
          try {
            await walletClient.writeContract({
              address: circleAddress,
              abi: CIRCLE_ABI,
              functionName: 'triggerDefault',
              args: [BigInt(round.circle.id), cm.member.id as `0x${string}`],
            });
          } catch {
            // Member may have paid or already been defaulted — skip
          }
        }
      }

      this.logger.log(`Grace period check complete: ${data.rounds.length} rounds processed`);
    } catch (error) {
      this.logger.error('Grace period job failed', error);
    }
  }
}
