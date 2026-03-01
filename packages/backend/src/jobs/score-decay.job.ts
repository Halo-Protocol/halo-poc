import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { GraphQLClient } from 'graphql-request';

const GET_INACTIVE_USERS = `
  query GetInactiveUsers($cutoff: BigInt!) {
    members(
      where: { lastActivity_lt: $cutoff, score_gt: 300 }
      first: 100
    ) {
      id
      score
      lastActivity
    }
  }
`;

const CREDIT_SCORE_ABI = parseAbi([
  'function applyDecay(address user) external',
]);

@Injectable()
export class ScoreDecayJob {
  private readonly logger = new Logger(ScoreDecayJob.name);

  constructor(private readonly config: ConfigService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runScoreDecay(): Promise<void> {
    this.logger.log('Starting daily score decay job...');

    try {
      const gql = new GraphQLClient(this.config.get('SUBGRAPH_URL_SEPOLIA', ''));
      const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago

      const data = await gql.request<{ members: Array<{ id: string; score: number }> }>(
        GET_INACTIVE_USERS,
        { cutoff: cutoff.toString() },
      );

      const users = data.members;
      this.logger.log(`Found ${users.length} users eligible for decay`);

      if (users.length === 0) return;

      // Call applyDecay on chain for each user
      const privateKey = this.config.get<`0x${string}`>('PRIVATE_KEY');
      if (!privateKey) {
        this.logger.warn('No PRIVATE_KEY configured, skipping on-chain decay');
        return;
      }

      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(this.config.get('ARBITRUM_SEPOLIA_RPC')),
      });

      const creditScoreAddress = this.config.get<`0x${string}`>('CREDIT_SCORE_ADDRESS');
      if (!creditScoreAddress) {
        this.logger.warn('No CREDIT_SCORE_ADDRESS configured');
        return;
      }

      // Process in batches of 10 to avoid gas issues
      const batchSize = 10;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(
          batch.map((u) =>
            walletClient.writeContract({
              address: creditScoreAddress,
              abi: CREDIT_SCORE_ABI,
              functionName: 'applyDecay',
              args: [u.id as `0x${string}`],
            }),
          ),
        );
        this.logger.log(`Processed decay batch ${i / batchSize + 1}`);
      }

      this.logger.log(`Score decay complete: ${users.length} users processed`);
    } catch (error) {
      this.logger.error('Score decay job failed', error);
    }
  }
}
