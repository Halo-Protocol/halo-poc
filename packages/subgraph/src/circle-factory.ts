import { BigInt } from '@graphprotocol/graph-ts';
import { CircleCreated } from '../generated/CircleFactory/CircleFactory';
import { Circle, Member, ProtocolMetrics } from '../generated/schema';

export function handleCircleCreated(event: CircleCreated): void {
  let circleId = event.params.circleId.toString();
  let creatorAddr = event.params.creator.toHexString();

  // Ensure creator exists
  let creator = Member.load(creatorAddr);
  if (!creator) {
    creator = new Member(creatorAddr);
    creator.score = 500;
    creator.tier = 'FAIR';
    creator.totalContributions = BigInt.fromI32(0);
    creator.onTimePayments = 0;
    creator.defaults = 0;
    creator.circlesCompleted = 0;
    creator.joinedAt = event.block.timestamp;
    creator.lastActivity = event.block.timestamp;
    creator.save();
  }

  let circle = new Circle(circleId);
  circle.creator = creatorAddr;
  circle.status = 'PENDING';
  circle.memberCount = 0; // Will be updated from Circle events
  circle.contributionAmount = BigInt.fromI32(0);
  circle.cycleDuration = 0;
  circle.gracePeriod = 0;
  circle.token = '';
  circle.currentRoundId = 0;
  circle.startTime = BigInt.fromI32(0);
  circle.tvl = BigInt.fromI32(0);
  circle.totalPaid = BigInt.fromI32(0);
  circle.createdAt = event.block.timestamp;
  circle.createdTx = event.transaction.hash.toHexString();
  circle.save();

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
    metrics.averageScore = 500;
  }
  metrics.totalCircles = metrics.totalCircles + 1;
  metrics.updatedAt = event.block.timestamp;
  metrics.save();
}
