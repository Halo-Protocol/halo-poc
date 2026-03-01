import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { ProviderService } from './provider.service.js';
import { NotificationsGateway } from '../modules/notifications/notifications.gateway.js';
import { CirclesService } from '../modules/circles/circles.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Minimal ABIs for event listening
const CIRCLE_ABI = [
  'event ContributionMade(uint256 indexed circleId, uint256 indexed roundId, address indexed member, uint256 amount, bool onTime)',
  'event PayoutClaimed(uint256 indexed circleId, uint256 indexed roundId, address indexed recipient, uint256 amount)',
  'event SoftDefault(uint256 indexed circleId, address indexed member, uint256 contribution, uint256 escrowRemaining)',
  'event HardDefault(uint256 indexed circleId, address indexed member, uint256 remainingEscrow)',
  'event CircleCompleted(uint256 indexed circleId, uint256 timestamp)',
  'event CircleCancelled(uint256 indexed circleId, string reason)',
  'event EscrowReleased(uint256 indexed circleId, address indexed member, uint256 amount)',
];

const FACTORY_ABI = [
  'event CircleCreated(uint256 indexed circleId, address indexed creator)',
];

const SCORE_ABI = [
  'event ScoreUpdated(address indexed user, uint256 oldScore, uint256 newScore, uint8 reason, int256 delta)',
];

@Injectable()
export class EventListenerService implements OnModuleInit {
  private readonly logger = new Logger(EventListenerService.name);
  private circleContract?: ethers.Contract;
  private factoryContract?: ethers.Contract;
  private scoreContract?: ethers.Contract;

  constructor(
    private readonly config: ConfigService,
    private readonly provider: ProviderService,
    private readonly gateway: NotificationsGateway,
    private readonly circlesService: CirclesService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (!this.provider.isConnected) {
      this.logger.warn('Provider not connected — event listener skipped');
      return;
    }
    this._bindListeners();
  }

  private _bindListeners() {
    const circleAddr = this.config.get<string>('CIRCLE_CONTRACT_ADDRESS');
    const factoryAddr = this.config.get<string>('CIRCLE_FACTORY_ADDRESS');
    const scoreAddr = this.config.get<string>('CREDIT_SCORE_ADDRESS');

    if (circleAddr) {
      this.circleContract = this.provider.getContract(circleAddr, CIRCLE_ABI);
      this._listenCircleEvents();
    }
    if (factoryAddr) {
      this.factoryContract = this.provider.getContract(factoryAddr, FACTORY_ABI);
      this._listenFactoryEvents();
    }
    if (scoreAddr) {
      this.scoreContract = this.provider.getContract(scoreAddr, SCORE_ABI);
      this._listenScoreEvents();
    }
  }

  private _listenCircleEvents() {
    const c = this.circleContract!;

    c.on('ContributionMade', async (circleId, roundId, member, amount, onTime) => {
      const payload = {
        circleId: circleId.toString(),
        roundId: roundId.toString(),
        member,
        amount: amount.toString(),
        onTime,
      };
      this.gateway.emitContribution(circleId.toString(), payload);
      await this.circlesService.invalidateCache(circleId.toString());
    });

    c.on('PayoutClaimed', async (circleId, roundId, recipient, amount) => {
      const payload = {
        circleId: circleId.toString(),
        roundId: roundId.toString(),
        recipient,
        amount: amount.toString(),
      };
      this.gateway.emitPayout(circleId.toString(), payload);
      await this.circlesService.invalidateCache(circleId.toString());
    });

    c.on('SoftDefault', async (circleId, member, contribution, escrowRemaining) => {
      this.gateway.emitDefault(circleId.toString(), {
        type: 'SOFT',
        circleId: circleId.toString(),
        member,
        contribution: contribution.toString(),
        escrowRemaining: escrowRemaining.toString(),
      });
      await this.circlesService.invalidateCache(circleId.toString());
    });

    c.on('HardDefault', async (circleId, member, remainingEscrow) => {
      this.gateway.emitDefault(circleId.toString(), {
        type: 'HARD',
        circleId: circleId.toString(),
        member,
        remainingEscrow: remainingEscrow.toString(),
      });
      await this.circlesService.invalidateCache(circleId.toString());
    });

    c.on('CircleCompleted', async (circleId) => {
      await this.circlesService.invalidateCache(circleId.toString());
    });

    this.logger.log(`Listening to Circle events at ${this.circleContract!.target}`);
  }

  private _listenFactoryEvents() {
    this.factoryContract!.on('CircleCreated', async (circleId, creator) => {
      this.gateway.emitNewCircle({ circleId: circleId.toString(), creator });
    });
    this.logger.log(`Listening to Factory events at ${this.factoryContract!.target}`);
  }

  private _listenScoreEvents() {
    this.scoreContract!.on('ScoreUpdated', async (user, oldScore, newScore, reason, delta) => {
      this.gateway.emitScoreUpdate(user.toLowerCase(), {
        user,
        oldScore: Number(oldScore),
        newScore: Number(newScore),
        reason: Number(reason),
        delta: Number(delta),
      });
    });
    this.logger.log(`Listening to Score events at ${this.scoreContract!.target}`);
  }
}
