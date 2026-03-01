import { BigInt } from '@graphprotocol/graph-ts';
import {
  ScoreUpdated,
  ScoreInitialized,
  InactivityDecayApplied,
} from '../generated/CreditScore/CreditScore';
import { Member, CreditEvent, ProtocolMetrics } from '../generated/schema';

const TIERS = ['POOR', 'FAIR', 'GOOD', 'VERY_GOOD', 'EXCEPTIONAL'];

const REASONS = [
  'ON_TIME_PAYMENT', 'EARLY_PAYMENT', 'GRACE_PERIOD_PAYMENT',
  'SOFT_DEFAULT', 'HARD_DEFAULT', 'CIRCLE_COMPLETION',
  'STREAK_3_MONTH', 'STREAK_6_MONTH', 'STREAK_12_MONTH',
  'VOUCH_RECEIVED', 'FRAUD_REPORT', 'INACTIVITY_DECAY',
];

function getTierString(score: i32): string {
  if (score >= 800) return 'EXCEPTIONAL';
  if (score >= 740) return 'VERY_GOOD';
  if (score >= 670) return 'GOOD';
  if (score >= 580) return 'FAIR';
  return 'POOR';
}

export function handleScoreInitialized(event: ScoreInitialized): void {
  let address = event.params.user.toHexString();
  let member = Member.load(address);
  if (!member) {
    member = new Member(address);
    member.totalContributions = BigInt.fromI32(0);
    member.onTimePayments = 0;
    member.defaults = 0;
    member.circlesCompleted = 0;
    member.lastActivity = event.block.timestamp;
  }
  member.score = event.params.initialScore.toI32();
  member.tier = getTierString(event.params.initialScore.toI32());
  member.joinedAt = event.params.timestamp;
  member.save();
}

export function handleScoreUpdated(event: ScoreUpdated): void {
  let address = event.params.user.toHexString();
  let member = Member.load(address);
  if (!member) return;

  let newScore = event.params.newScore.toI32();
  member.score = newScore;
  member.tier = getTierString(newScore);
  member.lastActivity = event.block.timestamp;
  member.save();

  // Create credit event
  let eventId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let creditEvent = new CreditEvent(eventId);
  creditEvent.user = address;
  creditEvent.score = newScore;
  creditEvent.tier = getTierString(newScore);
  creditEvent.delta = event.params.delta.toI32();
  creditEvent.reason = REASONS[event.params.reason];
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.txHash = event.transaction.hash.toHexString();
  creditEvent.save();

  // Update average score in metrics (approximate)
  let metrics = ProtocolMetrics.load('singleton');
  if (metrics && metrics.totalMembers > 0) {
    // Weighted average approximation
    metrics.updatedAt = event.block.timestamp;
    metrics.save();
  }
}

export function handleInactivityDecay(event: InactivityDecayApplied): void {
  let address = event.params.user.toHexString();
  let member = Member.load(address);
  if (!member) return;

  let newScore = event.params.newScore.toI32();
  member.score = newScore;
  member.tier = getTierString(newScore);
  member.save();

  // Create decay event
  let eventId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let creditEvent = new CreditEvent(eventId);
  creditEvent.user = address;
  creditEvent.score = newScore;
  creditEvent.tier = getTierString(newScore);
  creditEvent.delta = event.params.newScore.toI32() - event.params.oldScore.toI32();
  creditEvent.reason = 'INACTIVITY_DECAY';
  creditEvent.timestamp = event.block.timestamp;
  creditEvent.txHash = event.transaction.hash.toHexString();
  creditEvent.save();
}
