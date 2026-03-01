import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { CirclesModule } from './modules/circles/circles.module';
import { ScoresModule } from './modules/scores/scores.module';
import { AttestationsModule } from './modules/attestations/attestations.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { OraclesModule } from './modules/oracles/oracles.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Scheduling (cron jobs)
    ScheduleModule.forRoot(),

    // Feature modules
    BlockchainModule,
    AuthModule,
    CirclesModule,
    ScoresModule,
    AttestationsModule,
    AnalyticsModule,
    OraclesModule,
    JobsModule,
  ],
})
export class AppModule {}
