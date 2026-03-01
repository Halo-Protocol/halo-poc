import { BigDecimal, BigInt, store } from '@graphprotocol/graph-ts';
import {
  MemberJoined,
  EscrowDeposited,
  CircleActivated,
  ContributionMade,
  PayoutClaimed,
  SoftDefault,
  HardDefault,
  EscrowReleased,
  CircleCompleted,
  CircleCancelled,
} from '../generated/Circle/Circle';
import {
  Circle,
  CircleMember,
  Member,
  Round,
  Payment,
  ProtocolMetrics,
  DailyMetrics,
} from '../generated/schema';

function getOrCreateMember(address: string, timestamp: BigInt): Member {
  let member = Member.load(address);
  if (!member) {
    member = new Member(address);
    member.score = 500;
    member.tier = 'FAIR';
    member.totalContributions = BigInt.fromI32(0);
    member.onTimePayments = 0;
    member.defaults = 0;
    member.circlesCompleted = 0;
    member.joinedAt = timestamp;
    member.lastActivity = timestamp;
    member.save();

    // Update protocol metrics
    let metrics = getOrCreateProtocolMetrics();
    metrics.totalMembers = metrics.totalMembers + 1;
    metrics.updatedAt = timestamp;
    metrics.save();
  }
  return member!;
}

function getOrCreateProtocolMetrics(): ProtocolMetrics {
  let metrics = ProtocolMetrics.load('singleton');
  if (!metrics) {
    metrics = new ProtocolMetrics('singleton');
    metrics.totalMembers = 0;
    metrics.totalCircles = 0;
    metrics.activeCircles = 0;
    metrics.completedCircles = 0;
    metrics.cancelledCircles = 0;
    metrics.totalValueLocked = BigInt.fromI32(0);
    metrics.totalPayouts = BigInt.fromI32(0);
    metrics.totalContributions = BigInt.fromI32(0);
    metrics.defaultRate = BigDecimal.fromString('0');
    metrics.averageScore = 500;
    metrics.updatedAt = BigInt.fromI32(0);
  }
  return metrics!;
}

function getDailyId(timestamp: BigInt): string {
  let dayTimestamp = timestamp.toI32() / 86400;
  return dayTimestamp.toString();
}

export function handleMemberJoined(event: MemberJoined): void {
  let circleId = event.params.circleId.toString();
  let memberAddr = event.params.member.toHexString();

  getOrCreateMember(memberAddr, event.block.timestamp);

  let cmId = circleId + '-' + memberAddr;
  let cm = new CircleMember(cmId);
  cm.circle = circleId;
  cm.member = memberAddr;
  cm.hasDeposited = false;
  cm.isActive = true;
  cm.payoutRound = 0;
  cm.paidRounds = 0;
  cm.escrowRemaining = BigInt.fromI32(0);
  cm.joinedAt = event.block.timestamp;
  cm.save();
}

export function handleEscrowDeposited(event: EscrowDeposited): void {
  let circleId = event.params.circleId.toString();
  let memberAddr = event.params.member.toHexString();
  let cmId = circleId + '-' + memberAddr;

  let cm = CircleMember.load(cmId);
  if (cm) {
    cm.hasDeposited = true;
    cm.escrowRemaining = event.params.amount;
    cm.save();
  }

  let circle = Circle.load(circleId);
  if (circle) {
    circle.tvl = circle.tvl.plus(event.params.amount);
    circle.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.totalValueLocked = metrics.totalValueLocked.plus(event.params.amount);
  metrics.save();
}

export function handleCircleActivated(event: CircleActivated): void {
  let circleId = event.params.circleId.toString();
  let circle = Circle.load(circleId);
  if (circle) {
    circle.status = 'ACTIVE';
    circle.startTime = event.params.startTime;
    circle.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.activeCircles = metrics.activeCircles + 1;
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}

export function handleContributionMade(event: ContributionMade): void {
  let circleId = event.params.circleId.toString();
  let roundId = event.params.roundId.toString();
  let memberAddr = event.params.member.toHexString();

  let paymentId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let payment = new Payment(paymentId);
  payment.circle = circleId;
  payment.round = circleId + '-' + roundId;
  payment.member = memberAddr;
  payment.amount = event.params.amount;
  payment.onTime = event.params.onTime;
  payment.timestamp = event.block.timestamp;
  payment.txHash = event.transaction.hash.toHexString();
  payment.save();

  // Update member stats
  let member = Member.load(memberAddr);
  if (member) {
    if (event.params.onTime) {
      member.onTimePayments = member.onTimePayments + 1;
    }
    member.totalContributions = member.totalContributions.plus(event.params.amount);
    member.lastActivity = event.block.timestamp;
    member.save();
  }

  // Update round
  let round = Round.load(circleId + '-' + roundId);
  if (round) {
    round.totalCollected = round.totalCollected.plus(event.params.amount);
    round.save();
  }

  // Update daily metrics
  let daily = DailyMetrics.load(getDailyId(event.block.timestamp));
  if (daily) {
    daily.volume = daily.volume.plus(event.params.amount);
    daily.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.totalContributions = metrics.totalContributions.plus(event.params.amount);
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}

export function handlePayoutClaimed(event: PayoutClaimed): void {
  let circleId = event.params.circleId.toString();
  let roundId = event.params.roundId.toString();

  let round = Round.load(circleId + '-' + roundId);
  if (round) {
    round.payoutClaimed = true;
    round.payoutAmount = event.params.amount;
    round.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.totalPayouts = metrics.totalPayouts.plus(event.params.amount);
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}

export function handleSoftDefault(event: SoftDefault): void {
  let memberAddr = event.params.member.toHexString();
  let member = Member.load(memberAddr);
  if (member) {
    member.defaults = member.defaults + 1;
    member.save();
  }

  // Update circle member escrow
  let cmId = event.params.circleId.toString() + '-' + memberAddr;
  let cm = CircleMember.load(cmId);
  if (cm) {
    cm.escrowRemaining = event.params.escrowRemaining;
    cm.save();
  }
}

export function handleHardDefault(event: HardDefault): void {
  let memberAddr = event.params.member.toHexString();
  let member = Member.load(memberAddr);
  if (member) {
    member.defaults = member.defaults + 1;
    member.save();
  }

  let cmId = event.params.circleId.toString() + '-' + memberAddr;
  let cm = CircleMember.load(cmId);
  if (cm) {
    cm.isActive = false;
    cm.escrowRemaining = BigInt.fromI32(0);
    cm.save();
  }
}

export function handleEscrowReleased(event: EscrowReleased): void {
  let circleId = event.params.circleId.toString();
  let memberAddr = event.params.member.toHexString();

  let cmId = circleId + '-' + memberAddr;
  let cm = CircleMember.load(cmId);
  if (cm) {
    cm.escrowRemaining = BigInt.fromI32(0);
    cm.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.totalValueLocked = metrics.totalValueLocked.minus(event.params.amount);
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}

export function handleCircleCompleted(event: CircleCompleted): void {
  let circleId = event.params.circleId.toString();
  let circle = Circle.load(circleId);
  if (circle) {
    circle.status = 'COMPLETED';
    circle.completedAt = event.block.timestamp;
    circle.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.completedCircles = metrics.completedCircles + 1;
  metrics.activeCircles = metrics.activeCircles - 1;
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}

export function handleCircleCancelled(event: CircleCancelled): void {
  let circleId = event.params.circleId.toString();
  let circle = Circle.load(circleId);
  if (circle) {
    circle.status = 'CANCELLED';
    circle.cancelledAt = event.block.timestamp;
    circle.save();
  }

  let metrics = getOrCreateProtocolMetrics();
  metrics.cancelledCircles = metrics.cancelledCircles + 1;
  if (metrics.activeCircles > 0) {
    metrics.activeCircles = metrics.activeCircles - 1;
  }
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}
