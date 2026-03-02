# Halo Protocol — Instrumentation Specification

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Status:** Draft for Review

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Architecture](#2-data-architecture)
3. [Subgraph Specification](#3-subgraph-specification)
4. [Public Dashboard](#4-public-dashboard)
5. [Milestone Verification](#5-milestone-verification)
6. [SDK Integration](#6-sdk-integration)
7. [Analytics & Reporting](#7-analytics--reporting)

---

## 1. Overview

### 1.1 Purpose

Halo Protocol implements comprehensive instrumentation to provide:

- **Transparency:** Public, real-time protocol metrics
- **Accountability:** Verifiable milestone achievements
- **Integration:** SDK for third-party protocol access
- **Monitoring:** Health checks and alert triggers

### 1.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SMART CONTRACTS                                                          │
│        │                                                                    │
│        │ Events                                                             │
│        ▼                                                                    │
│   ┌─────────────────┐                                                      │
│   │ The Graph       │ ◀── Indexes all contract events                     │
│   │ Subgraph        │                                                      │
│   └────────┬────────┘                                                      │
│            │                                                                │
│            │ GraphQL                                                        │
│            ▼                                                                │
│   ┌─────────────────────────────────────────────────────────────┐         │
│   │                                                             │         │
│   │  ┌───────────┐   ┌───────────┐   ┌───────────┐            │         │
│   │  │   Dune    │   │  Halo SDK │   │  Frontend │            │         │
│   │  │ Dashboard │   │  (npm)    │   │   App     │            │         │
│   │  └───────────┘   └───────────┘   └───────────┘            │         │
│   │                                                             │         │
│   │  PUBLIC CONSUMERS                                          │         │
│   └─────────────────────────────────────────────────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Hosting Strategy

| Component | Host | Cost | Rationale |
|-----------|------|------|-----------|
| Subgraph | The Graph Hosted/Studio | $0-200/mo | Industry standard, decentralized |
| Dashboard | Dune Analytics | $0-100/mo | Public, shareable, no maintenance |
| SDK | npm registry | $0 | Developer ecosystem |
| Backup Indexer | Goldsky (future) | $0-100/mo | Redundancy |

---

## 2. Data Architecture

### 2.1 Core Entities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIP DIAGRAM                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐       │
│   │    Member     │───1:N─│ Participation │───N:1─│    Circle     │       │
│   │               │       │               │       │               │       │
│   │ • address     │       │ • role        │       │ • id          │       │
│   │ • creditScore │       │ • escrowAmt   │       │ • organizer   │       │
│   │ • totalPaid   │       │ • paymentsMade│       │ • contribution│       │
│   │ • defaults    │       │ • defaulted   │       │ • memberCount │       │
│   │ • firstActive │       │ • joinedAt    │       │ • status      │       │
│   └───────────────┘       └───────────────┘       └───────────────┘       │
│          │                       │                       │                 │
│          │ 1:N                   │                       │ 1:N             │
│          ▼                       │                       ▼                 │
│   ┌───────────────┐              │               ┌───────────────┐        │
│   │  CreditEvent  │              │               │     Round     │        │
│   │               │              │               │               │        │
│   │ • eventType   │              │               │ • roundNumber │        │
│   │ • pointsDelta │              │               │ • recipient   │        │
│   │ • newScore    │              │               │ • totalPaid   │        │
│   │ • timestamp   │              │               │ • status      │        │
│   │ • sourceId    │              │               │ • completedAt │        │
│   └───────────────┘              │               └───────────────┘        │
│                                  │                       │                 │
│                                  │ 1:N                   │ 1:N             │
│                                  ▼                       ▼                 │
│                          ┌───────────────┐       ┌───────────────┐        │
│                          │    Payment    │───────│    Default    │        │
│                          │               │       │               │        │
│                          │ • amount      │       │ • type        │        │
│                          │ • timing      │       │ • amountLost  │        │
│                          │ • timestamp   │       │ • escrowUsed  │        │
│                          │ • status      │       │ • timestamp   │        │
│                          └───────────────┘       └───────────────┘        │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                      ProtocolMetrics (Singleton)                   │   │
│   │                                                                    │   │
│   │ • totalCircles        • totalVolume          • avgCircleSize      │   │
│   │ • activeCircles       • totalDefaults        • avgScore           │   │
│   │ • completedCircles    • totalDefaultAmount   • medianScore        │   │
│   │ • cancelledCircles    • defaultRate          • scoreDistribution  │   │
│   │ • totalMembers        • totalEscrowLocked    • dailyActiveUsers   │   │
│   │ • uniqueMembers       • totalPayouts         • weeklyActiveUsers  │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Event Indexing

All contract events are indexed by the subgraph:

| Contract | Event | Fields Indexed |
|----------|-------|----------------|
| CircleFactory | CircleCreated | id, organizer, memberCount, contribution, timestamp |
| Circle | MemberJoined | circleId, member, escrowAmount |
| Circle | RoundStarted | circleId, roundId, recipient |
| Circle | ContributionMade | circleId, roundId, member, amount, timing |
| Circle | PayoutExecuted | circleId, roundId, recipient, amount |
| Circle | CircleCompleted | circleId, finalVolume |
| Escrow | EscrowDeposited | member, circleId, amount |
| Escrow | EscrowDeducted | member, circleId, amount, reason |
| CreditScore | ScoreUpdated | member, delta, newScore, reason |
| PenaltyEngine | DefaultRecorded | member, circleId, type, amount |
| PenaltyEngine | MemberBlacklisted | member, until |

---

## 3. Subgraph Specification

### 3.1 Schema Definition

```graphql
# schema.graphql

# ============================================
# CORE ENTITIES
# ============================================

type Member @entity {
  id: ID!                           # Wallet address
  address: Bytes!
  
  # Credit Score
  creditScore: Int!                 # Current score (300-850)
  scoreHistory: [CreditEvent!]! @derivedFrom(field: "member")
  
  # Participation
  circles: [Participation!]! @derivedFrom(field: "member")
  circlesOrganized: [Circle!]! @derivedFrom(field: "organizer")
  totalCirclesJoined: Int!
  totalCirclesCompleted: Int!
  
  # Financial
  totalContributed: BigInt!         # Lifetime contributions
  totalReceived: BigInt!            # Lifetime payouts
  currentEscrowLocked: BigInt!      # Currently locked escrow
  
  # Defaults
  softDefaults: Int!
  hardDefaults: Int!
  totalDefaultAmount: BigInt!
  
  # Blacklist
  isBlacklisted: Boolean!
  blacklistedUntil: BigInt
  
  # Timestamps
  firstActiveAt: BigInt!
  lastActiveAt: BigInt!
  
  # Attestations
  vouchesReceived: [Attestation!]! @derivedFrom(field: "subject")
  vouchesGiven: [Attestation!]! @derivedFrom(field: "attester")
}

type Circle @entity {
  id: ID!                           # Circle ID
  
  # Configuration
  organizer: Member!
  contributionAmount: BigInt!
  memberCount: Int!
  cycleDuration: Int!               # In seconds
  payoutOrder: PayoutOrderType!
  token: Bytes!                     # Token address
  
  # State
  status: CircleStatus!
  currentRound: Int!
  
  # Participants
  participations: [Participation!]! @derivedFrom(field: "circle")
  rounds: [Round!]! @derivedFrom(field: "circle")
  
  # Financials
  totalVolume: BigInt!              # Total contributions made
  totalPaidOut: BigInt!             # Total payouts executed
  escrowLocked: BigInt!             # Currently locked escrow
  
  # Defaults
  defaultCount: Int!
  defaultAmount: BigInt!
  
  # Timestamps
  createdAt: BigInt!
  fundedAt: BigInt
  completedAt: BigInt
  
  # Metadata
  blockNumber: BigInt!
  transactionHash: Bytes!
}

type Participation @entity {
  id: ID!                           # circleId-memberAddress
  circle: Circle!
  member: Member!
  
  # Role
  role: ParticipantRole!            # ORGANIZER or MEMBER
  
  # Escrow
  escrowDeposited: BigInt!
  escrowRemaining: BigInt!
  escrowDeducted: BigInt!
  
  # Payments
  paymentsMade: Int!
  paymentsOnTime: Int!
  paymentsLate: Int!
  paymentsMissed: Int!              # Covered by escrow
  totalContributed: BigInt!
  
  # Payout
  hasReceivedPayout: Boolean!
  payoutAmount: BigInt
  payoutRound: Int
  
  # Status
  isActive: Boolean!
  defaulted: Boolean!
  removedAt: BigInt
  
  # Timestamps
  joinedAt: BigInt!
}

type Round @entity {
  id: ID!                           # circleId-roundNumber
  circle: Circle!
  roundNumber: Int!
  
  # Recipient
  recipient: Member!
  
  # Payments
  payments: [Payment!]! @derivedFrom(field: "round")
  expectedAmount: BigInt!           # memberCount * contribution
  collectedAmount: BigInt!          # Actually collected
  
  # Status
  status: RoundStatus!
  
  # Timestamps
  startedAt: BigInt!
  dueAt: BigInt!
  completedAt: BigInt
}

type Payment @entity {
  id: ID!                           # circleId-roundId-memberAddress
  round: Round!
  member: Member!
  
  # Details
  amount: BigInt!
  timing: PaymentTiming!            # EARLY, ON_TIME, LATE_GRACE, ESCROW_DEDUCTED
  
  # Score impact
  scoreImpact: Int!
  
  # Timestamps
  dueAt: BigInt!
  paidAt: BigInt
  
  # Transaction
  transactionHash: Bytes!
}

type CreditEvent @entity {
  id: ID!                           # Auto-generated
  member: Member!
  
  # Event details
  eventType: CreditEventType!
  pointsDelta: Int!
  scoreBefore: Int!
  scoreAfter: Int!
  reason: String!
  
  # Source
  sourceType: SourceType!           # CIRCLE, ATTESTATION, PENALTY, ADMIN
  sourceId: String                  # Circle ID or attestation ID
  
  # Timestamp
  timestamp: BigInt!
  blockNumber: BigInt!
  transactionHash: Bytes!
}

type Attestation @entity {
  id: ID!                           # Attestation ID / hash
  
  # Parties
  attester: Member!
  subject: Member!
  
  # Details
  attestationType: AttestationType!
  scoreImpact: Int!
  decayMonths: Int!
  
  # Status
  isRevoked: Boolean!
  revokedAt: BigInt
  
  # Timestamps
  createdAt: BigInt!
  expiresAt: BigInt                 # Calculated from decay
}

type Default @entity {
  id: ID!                           # Auto-generated
  member: Member!
  circle: Circle!
  round: Round!
  
  # Details
  defaultType: DefaultType!         # SOFT, HARD
  amountOwed: BigInt!
  amountCovered: BigInt!            # Covered by escrow
  amountLost: BigInt!               # Uncovered
  
  # Impact
  scorePenalty: Int!
  blacklistDuration: Int            # In seconds, if applicable
  
  # Timestamp
  timestamp: BigInt!
  blockNumber: BigInt!
  transactionHash: Bytes!
}

# ============================================
# PROTOCOL METRICS (Singleton)
# ============================================

type ProtocolMetrics @entity {
  id: ID!                           # "protocol"
  
  # Circle metrics
  totalCircles: Int!
  activeCircles: Int!
  completedCircles: Int!
  cancelledCircles: Int!
  
  # Member metrics
  totalMembers: Int!                # Total ever participated
  uniqueMembers: Int!               # Unique addresses
  activeMembers: Int!               # Currently in active circle
  
  # Financial metrics
  totalVolume: BigInt!              # All-time contributions
  totalPayouts: BigInt!             # All-time payouts
  totalEscrowLocked: BigInt!        # Currently locked
  totalEscrowDeducted: BigInt!      # From defaults
  
  # Default metrics
  totalDefaults: Int!
  totalSoftDefaults: Int!
  totalHardDefaults: Int!
  totalDefaultAmount: BigInt!
  defaultRate: BigDecimal!          # Defaults / total payments
  
  # Score metrics
  averageScore: BigDecimal!
  medianScore: Int!
  scoreDistribution: [Int!]!        # Histogram buckets
  
  # Activity metrics
  dailyActiveUsers: Int!
  weeklyActiveUsers: Int!
  monthlyActiveUsers: Int!
  
  # Timestamps
  lastUpdated: BigInt!
}

type DailyMetrics @entity {
  id: ID!                           # Date string: "2026-02-23"
  date: BigInt!                     # Unix timestamp (start of day)
  
  # Daily counts
  circlesCreated: Int!
  circlesCompleted: Int!
  membersJoined: Int!
  paymentsProcessed: Int!
  
  # Daily volume
  contributionVolume: BigInt!
  payoutVolume: BigInt!
  escrowDeposited: BigInt!
  escrowDeducted: BigInt!
  
  # Daily defaults
  softDefaults: Int!
  hardDefaults: Int!
  defaultAmount: BigInt!
  
  # Cumulative (for charts)
  cumulativeVolume: BigInt!
  cumulativeMembers: Int!
  cumulativeCircles: Int!
}

# ============================================
# ENUMS
# ============================================

enum CircleStatus {
  PENDING
  FUNDING
  ACTIVE
  COMPLETED
  CANCELLED
  DEFAULTED
}

enum PayoutOrderType {
  FIXED
  AUCTION
  RANDOM
}

enum ParticipantRole {
  ORGANIZER
  MEMBER
}

enum RoundStatus {
  PENDING
  OPEN
  GRACE_PERIOD
  COMPLETED
  DEFAULTED
}

enum PaymentTiming {
  EARLY
  ON_TIME
  LATE_GRACE
  ESCROW_DEDUCTED
  DEFAULTED
}

enum CreditEventType {
  PAYMENT_ONTIME
  PAYMENT_EARLY
  PAYMENT_LATE
  SOFT_DEFAULT
  HARD_DEFAULT
  CIRCLE_COMPLETED
  STREAK_BONUS
  VOUCH_RECEIVED
  VOUCH_REVOKED
  WARNING_RECEIVED
  BADGE_EARNED
  DECAY_APPLIED
  ADMIN_ADJUSTMENT
}

enum SourceType {
  CIRCLE
  ATTESTATION
  PENALTY
  ADMIN
}

enum AttestationType {
  VOUCH
  WARN
  FRAUD_REPORT
  BADGE
}

enum DefaultType {
  SOFT
  HARD
}
```

### 3.2 Subgraph Mappings

```typescript
// src/mappings/circle.ts

import { BigInt, Address } from "@graphprotocol/graph-ts";
import {
  CircleCreated,
  MemberJoined,
  ContributionMade,
  PayoutExecuted,
  CircleCompleted,
} from "../generated/CircleFactory/CircleFactory";
import {
  Circle,
  Member,
  Participation,
  Round,
  Payment,
  ProtocolMetrics,
  DailyMetrics,
} from "../generated/schema";

export function handleCircleCreated(event: CircleCreated): void {
  // Create Circle entity
  let circle = new Circle(event.params.circleId.toString());
  
  // Get or create organizer
  let organizer = getOrCreateMember(event.params.organizer);
  organizer.totalCirclesJoined = organizer.totalCirclesJoined + 1;
  organizer.save();
  
  circle.organizer = organizer.id;
  circle.contributionAmount = event.params.contributionAmount;
  circle.memberCount = event.params.memberCount;
  circle.cycleDuration = event.params.cycleDuration.toI32();
  circle.payoutOrder = "FIXED";  // Default
  circle.token = event.params.token;
  circle.status = "PENDING";
  circle.currentRound = 0;
  circle.totalVolume = BigInt.zero();
  circle.totalPaidOut = BigInt.zero();
  circle.escrowLocked = BigInt.zero();
  circle.defaultCount = 0;
  circle.defaultAmount = BigInt.zero();
  circle.createdAt = event.block.timestamp;
  circle.blockNumber = event.block.number;
  circle.transactionHash = event.transaction.hash;
  circle.save();
  
  // Create participation for organizer
  let participation = new Participation(
    event.params.circleId.toString() + "-" + event.params.organizer.toHexString()
  );
  participation.circle = circle.id;
  participation.member = organizer.id;
  participation.role = "ORGANIZER";
  participation.escrowDeposited = BigInt.zero();
  participation.escrowRemaining = BigInt.zero();
  participation.escrowDeducted = BigInt.zero();
  participation.paymentsMade = 0;
  participation.paymentsOnTime = 0;
  participation.paymentsLate = 0;
  participation.paymentsMissed = 0;
  participation.totalContributed = BigInt.zero();
  participation.hasReceivedPayout = false;
  participation.isActive = true;
  participation.defaulted = false;
  participation.joinedAt = event.block.timestamp;
  participation.save();
  
  // Update protocol metrics
  let metrics = getOrCreateProtocolMetrics();
  metrics.totalCircles = metrics.totalCircles + 1;
  metrics.lastUpdated = event.block.timestamp;
  metrics.save();
  
  // Update daily metrics
  updateDailyMetrics(event.block.timestamp, "circlesCreated", 1);
}

export function handleMemberJoined(event: MemberJoined): void {
  let circle = Circle.load(event.params.circleId.toString());
  if (!circle) return;
  
  let member = getOrCreateMember(event.params.member);
  member.totalCirclesJoined = member.totalCirclesJoined + 1;
  member.lastActiveAt = event.block.timestamp;
  member.save();
  
  let participation = new Participation(
    event.params.circleId.toString() + "-" + event.params.member.toHexString()
  );
  participation.circle = circle.id;
  participation.member = member.id;
  participation.role = "MEMBER";
  participation.escrowDeposited = event.params.escrowAmount;
  participation.escrowRemaining = event.params.escrowAmount;
  participation.escrowDeducted = BigInt.zero();
  participation.paymentsMade = 0;
  participation.paymentsOnTime = 0;
  participation.paymentsLate = 0;
  participation.paymentsMissed = 0;
  participation.totalContributed = BigInt.zero();
  participation.hasReceivedPayout = false;
  participation.isActive = true;
  participation.defaulted = false;
  participation.joinedAt = event.block.timestamp;
  participation.save();
  
  // Update circle escrow
  circle.escrowLocked = circle.escrowLocked.plus(event.params.escrowAmount);
  circle.save();
  
  // Update metrics
  let metrics = getOrCreateProtocolMetrics();
  metrics.totalEscrowLocked = metrics.totalEscrowLocked.plus(event.params.escrowAmount);
  metrics.save();
  
  updateDailyMetrics(event.block.timestamp, "membersJoined", 1);
}

export function handleContributionMade(event: ContributionMade): void {
  let roundId = event.params.circleId.toString() + "-" + event.params.roundId.toString();
  let round = Round.load(roundId);
  if (!round) return;
  
  let paymentId = roundId + "-" + event.params.member.toHexString();
  let payment = new Payment(paymentId);
  payment.round = round.id;
  payment.member = event.params.member.toHexString();
  payment.amount = event.params.amount;
  payment.timing = mapPaymentTiming(event.params.timing);
  payment.scoreImpact = calculateScoreImpact(event.params.timing);
  payment.dueAt = round.dueAt;
  payment.paidAt = event.block.timestamp;
  payment.transactionHash = event.transaction.hash;
  payment.save();
  
  // Update round
  round.collectedAmount = round.collectedAmount.plus(event.params.amount);
  round.save();
  
  // Update participation
  let participationId = event.params.circleId.toString() + "-" + event.params.member.toHexString();
  let participation = Participation.load(participationId);
  if (participation) {
    participation.paymentsMade = participation.paymentsMade + 1;
    participation.totalContributed = participation.totalContributed.plus(event.params.amount);
    
    if (event.params.timing == 0 || event.params.timing == 1) {  // EARLY or ON_TIME
      participation.paymentsOnTime = participation.paymentsOnTime + 1;
    } else if (event.params.timing == 2) {  // LATE_GRACE
      participation.paymentsLate = participation.paymentsLate + 1;
    } else {  // ESCROW_DEDUCTED
      participation.paymentsMissed = participation.paymentsMissed + 1;
    }
    participation.save();
  }
  
  // Update member
  let member = Member.load(event.params.member.toHexString());
  if (member) {
    member.totalContributed = member.totalContributed.plus(event.params.amount);
    member.lastActiveAt = event.block.timestamp;
    member.save();
  }
  
  // Update circle
  let circle = Circle.load(event.params.circleId.toString());
  if (circle) {
    circle.totalVolume = circle.totalVolume.plus(event.params.amount);
    circle.save();
  }
  
  // Update metrics
  let metrics = getOrCreateProtocolMetrics();
  metrics.totalVolume = metrics.totalVolume.plus(event.params.amount);
  metrics.save();
  
  updateDailyMetrics(event.block.timestamp, "paymentsProcessed", 1);
  updateDailyVolumeMetrics(event.block.timestamp, "contributionVolume", event.params.amount);
}

export function handleCircleCompleted(event: CircleCompleted): void {
  let circle = Circle.load(event.params.circleId.toString());
  if (!circle) return;
  
  circle.status = "COMPLETED";
  circle.completedAt = event.block.timestamp;
  circle.save();
  
  // Update all participants
  let participations = circle.participations.load();
  for (let i = 0; i < participations.length; i++) {
    let participation = participations[i];
    participation.isActive = false;
    participation.save();
    
    let member = Member.load(participation.member);
    if (member) {
      member.totalCirclesCompleted = member.totalCirclesCompleted + 1;
      member.save();
    }
  }
  
  // Update metrics
  let metrics = getOrCreateProtocolMetrics();
  metrics.completedCircles = metrics.completedCircles + 1;
  metrics.activeCircles = metrics.activeCircles - 1;
  metrics.save();
  
  updateDailyMetrics(event.block.timestamp, "circlesCompleted", 1);
}

// Helper functions
function getOrCreateMember(address: Address): Member {
  let id = address.toHexString();
  let member = Member.load(id);
  
  if (!member) {
    member = new Member(id);
    member.address = address;
    member.creditScore = 500;  // Default starting score
    member.totalCirclesJoined = 0;
    member.totalCirclesCompleted = 0;
    member.totalContributed = BigInt.zero();
    member.totalReceived = BigInt.zero();
    member.currentEscrowLocked = BigInt.zero();
    member.softDefaults = 0;
    member.hardDefaults = 0;
    member.totalDefaultAmount = BigInt.zero();
    member.isBlacklisted = false;
    member.firstActiveAt = BigInt.zero();
    member.lastActiveAt = BigInt.zero();
    member.save();
    
    // Update unique member count
    let metrics = getOrCreateProtocolMetrics();
    metrics.uniqueMembers = metrics.uniqueMembers + 1;
    metrics.totalMembers = metrics.totalMembers + 1;
    metrics.save();
  }
  
  return member;
}

function getOrCreateProtocolMetrics(): ProtocolMetrics {
  let metrics = ProtocolMetrics.load("protocol");
  
  if (!metrics) {
    metrics = new ProtocolMetrics("protocol");
    metrics.totalCircles = 0;
    metrics.activeCircles = 0;
    metrics.completedCircles = 0;
    metrics.cancelledCircles = 0;
    metrics.totalMembers = 0;
    metrics.uniqueMembers = 0;
    metrics.activeMembers = 0;
    metrics.totalVolume = BigInt.zero();
    metrics.totalPayouts = BigInt.zero();
    metrics.totalEscrowLocked = BigInt.zero();
    metrics.totalEscrowDeducted = BigInt.zero();
    metrics.totalDefaults = 0;
    metrics.totalSoftDefaults = 0;
    metrics.totalHardDefaults = 0;
    metrics.totalDefaultAmount = BigInt.zero();
    metrics.defaultRate = BigDecimal.zero();
    metrics.averageScore = BigDecimal.fromString("500");
    metrics.medianScore = 500;
    metrics.scoreDistribution = [];
    metrics.dailyActiveUsers = 0;
    metrics.weeklyActiveUsers = 0;
    metrics.monthlyActiveUsers = 0;
    metrics.lastUpdated = BigInt.zero();
    metrics.save();
  }
  
  return metrics;
}
```

### 3.3 Subgraph Configuration

```yaml
# subgraph.yaml

specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: CircleFactory
    network: arbitrum-one
    source:
      address: "0x..."  # Deployed address
      abi: CircleFactory
      startBlock: 123456789  # Deployment block
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Circle
        - Member
        - Participation
      abis:
        - name: CircleFactory
          file: ./abis/CircleFactory.json
      eventHandlers:
        - event: CircleCreated(indexed uint256,indexed address,uint256,uint256,uint256,address)
          handler: handleCircleCreated
        - event: MemberJoined(indexed uint256,indexed address,uint256)
          handler: handleMemberJoined
      file: ./src/mappings/circleFactory.ts

  - kind: ethereum
    name: Circle
    network: arbitrum-one
    source:
      abi: Circle
      startBlock: 123456789
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Circle
        - Round
        - Payment
      abis:
        - name: Circle
          file: ./abis/Circle.json
      eventHandlers:
        - event: RoundStarted(indexed uint256,indexed uint256,indexed address)
          handler: handleRoundStarted
        - event: ContributionMade(indexed uint256,indexed uint256,indexed address,uint256,uint8)
          handler: handleContributionMade
        - event: PayoutExecuted(indexed uint256,indexed uint256,indexed address,uint256)
          handler: handlePayoutExecuted
        - event: CircleCompleted(indexed uint256,uint256)
          handler: handleCircleCompleted
      file: ./src/mappings/circle.ts

  - kind: ethereum
    name: CreditScore
    network: arbitrum-one
    source:
      address: "0x..."
      abi: CreditScore
      startBlock: 123456789
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Member
        - CreditEvent
      abis:
        - name: CreditScore
          file: ./abis/CreditScore.json
      eventHandlers:
        - event: ScoreUpdated(indexed address,int256,uint256,string)
          handler: handleScoreUpdated
      file: ./src/mappings/creditScore.ts
```

---

## 4. Public Dashboard

### 4.1 Dashboard Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     HALO PROTOCOL DASHBOARD                                  │
│                     https://dune.com/xxixlabs/halo                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                         OVERVIEW                                   │   │
│   │                                                                    │   │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│   │   │  TVL    │  │ Active  │  │  Total  │  │ 24h     │            │   │
│   │   │ $50,000 │  │ Circles │  │  Users  │  │ Volume  │            │   │
│   │   │         │  │   15    │  │   150   │  │ $2,500  │            │   │
│   │   └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                      CIRCLE ACTIVITY                               │   │
│   │                                                                    │   │
│   │   [Line Chart: Circles Created Over Time]                         │   │
│   │   [Bar Chart: Completed vs Active vs Cancelled]                   │   │
│   │   [Pie Chart: Circle Size Distribution]                           │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                       PAYMENTS                                     │   │
│   │                                                                    │   │
│   │   [Area Chart: Payment Volume Over Time]                          │   │
│   │   [Stacked Bar: On-time vs Late vs Default]                       │   │
│   │   [Gauge: Default Rate (Target: <5%)]                             │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                     CREDIT SCORES                                  │   │
│   │                                                                    │   │
│   │   [Histogram: Score Distribution (300-850)]                       │   │
│   │   [Line Chart: Average Score Over Time]                           │   │
│   │   [Table: Top Scorers]                                            │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                    HEALTH METRICS                                  │   │
│   │                                                                    │   │
│   │   [Gauge: Escrow Utilization]                                     │   │
│   │   [Gauge: Reserve Ratio]                                          │   │
│   │   [Counter: Blacklisted Users]                                    │   │
│   │   [Counter: Active Defaults]                                      │   │
│   │                                                                    │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dune Queries

```sql
-- Query 1: Protocol Overview
SELECT
    COUNT(DISTINCT circle_id) as total_circles,
    COUNT(DISTINCT CASE WHEN status = 'ACTIVE' THEN circle_id END) as active_circles,
    COUNT(DISTINCT member_address) as total_users,
    SUM(escrow_locked) / 1e6 as tvl_usd,
    SUM(contribution_volume) / 1e6 as total_volume_usd
FROM halo_protocol.circles c
LEFT JOIN halo_protocol.escrow e ON c.circle_id = e.circle_id
WHERE c.chain = 'arbitrum';

-- Query 2: Daily Volume
SELECT
    DATE_TRUNC('day', block_time) as date,
    SUM(amount) / 1e6 as daily_volume_usd,
    COUNT(*) as payment_count,
    COUNT(DISTINCT member_address) as active_users
FROM halo_protocol.payments
WHERE block_time >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- Query 3: Default Rate Over Time
WITH payment_stats AS (
    SELECT
        DATE_TRUNC('day', block_time) as date,
        COUNT(*) as total_payments,
        COUNT(CASE WHEN timing = 'ESCROW_DEDUCTED' THEN 1 END) as soft_defaults,
        COUNT(CASE WHEN timing = 'DEFAULTED' THEN 1 END) as hard_defaults
    FROM halo_protocol.payments
    WHERE block_time >= NOW() - INTERVAL '30 days'
    GROUP BY 1
)
SELECT
    date,
    total_payments,
    soft_defaults,
    hard_defaults,
    (soft_defaults + hard_defaults)::float / NULLIF(total_payments, 0) * 100 as default_rate_pct
FROM payment_stats
ORDER BY date;

-- Query 4: Credit Score Distribution
SELECT
    CASE
        WHEN credit_score >= 800 THEN 'Elite (800+)'
        WHEN credit_score >= 700 THEN 'Excellent (700-799)'
        WHEN credit_score >= 600 THEN 'Good (600-699)'
        WHEN credit_score >= 500 THEN 'Neutral (500-599)'
        WHEN credit_score >= 400 THEN 'Fair (400-499)'
        ELSE 'Poor (<400)'
    END as score_tier,
    COUNT(*) as user_count,
    AVG(credit_score) as avg_score
FROM halo_protocol.members
WHERE is_active = true
GROUP BY 1
ORDER BY MIN(credit_score) DESC;

-- Query 5: Circle Completion Rate
SELECT
    DATE_TRUNC('week', created_at) as week,
    COUNT(*) as circles_created,
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled,
    COUNT(CASE WHEN status = 'DEFAULTED' THEN 1 END) as defaulted,
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::float / 
        NULLIF(COUNT(*), 0) * 100 as completion_rate_pct
FROM halo_protocol.circles
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;

-- Query 6: Top Contributors
SELECT
    member_address,
    credit_score,
    total_contributed / 1e6 as total_contributed_usd,
    circles_completed,
    soft_defaults,
    hard_defaults
FROM halo_protocol.members
WHERE is_active = true
ORDER BY total_contributed DESC
LIMIT 20;

-- Query 7: Escrow Health
SELECT
    SUM(escrow_deposited) / 1e6 as total_deposited_usd,
    SUM(escrow_locked) / 1e6 as total_locked_usd,
    SUM(escrow_deducted) / 1e6 as total_deducted_usd,
    SUM(escrow_locked)::float / NULLIF(SUM(escrow_deposited), 0) * 100 as utilization_pct
FROM halo_protocol.escrow
WHERE is_active = true;
```

### 4.3 Dashboard Widgets

| Widget | Type | Data Source | Refresh |
|--------|------|-------------|---------|
| TVL Counter | Big Number | Query 1 | 5 min |
| Active Circles | Counter | Query 1 | 5 min |
| Total Users | Counter | Query 1 | 5 min |
| 24h Volume | Counter | Query 2 (filtered) | 5 min |
| Volume Chart | Area Chart | Query 2 | 1 hour |
| Default Rate | Gauge | Query 3 | 1 hour |
| Score Distribution | Histogram | Query 4 | 1 hour |
| Completion Rate | Line Chart | Query 5 | 1 hour |
| Top Contributors | Table | Query 6 | 1 hour |
| Escrow Health | Gauge | Query 7 | 5 min |

---

## 5. Milestone Verification

### 5.1 Verification Framework

Each milestone includes specific, verifiable metrics tracked via the subgraph and dashboard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MILESTONE VERIFICATION FRAMEWORK                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Verification Process:                                                    │
│   ─────────────────────                                                     │
│                                                                             │
│   1. AUTOMATED                                                             │
│      └── Subgraph queries return current metrics                          │
│      └── Dashboard shows real-time values                                  │
│      └── No manual data manipulation possible                              │
│                                                                             │
│   2. VERIFIABLE                                                            │
│      └── All data derived from on-chain events                            │
│      └── Block explorer can confirm transactions                          │
│      └── Third parties can run independent queries                        │
│                                                                             │
│   3. TIME-STAMPED                                                          │
│      └── Metrics tied to specific block numbers                           │
│      └── Historical data preserved                                         │
│      └── Snapshot at milestone deadline                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Milestone Metrics

#### Milestone 1: Testnet Launch (Week 8)

| Metric | Target | Verification Query |
|--------|--------|-------------------|
| Test users | 50 | `COUNT(DISTINCT member) WHERE chain='sepolia'` |
| Test circles | 20 | `COUNT(circle_id) WHERE chain='sepolia'` |
| Test transactions | 200 | `COUNT(*) FROM payments WHERE chain='sepolia'` |
| Test coverage | 90%+ | GitHub CI badge |
| Subgraph deployed | Yes | Graph Explorer link |

**Verification Query (Milestone 1):**
```graphql
query Milestone1Verification {
  protocolMetrics(id: "protocol") {
    totalMembers
    totalCircles
    totalVolume
  }
  circles(first: 1000) {
    id
    status
    participations {
      id
    }
  }
  payments(first: 1000) {
    id
    timestamp
  }
}
```

#### Milestone 2: Beta Mainnet (Week 14)

| Metric | Target | Verification Query |
|--------|--------|-------------------|
| Mainnet users | 50 | `COUNT(DISTINCT member) WHERE chain='arbitrum'` |
| Mainnet circles | 15 | `COUNT(circle_id) WHERE status='ACTIVE' OR status='COMPLETED'` |
| TVL | $10,000 | `SUM(escrow_locked) / 1e6` |
| Default rate | <5% | `(defaults / total_payments) * 100` |
| Dashboard live | Yes | Dune link accessible |

**Verification Query (Milestone 2):**
```graphql
query Milestone2Verification {
  protocolMetrics(id: "protocol") {
    totalMembers
    activeCircles
    completedCircles
    totalEscrowLocked
    defaultRate
  }
}
```

#### Milestone 3: Scale (Week 20)

| Metric | Target | Verification Query |
|--------|--------|-------------------|
| Total users | 100 | `uniqueMembers` |
| Active circles | 30 | `activeCircles` |
| TVL | $25,000 | `totalEscrowLocked / 1e6` |
| Default rate | <3% | `defaultRate` |
| Audit complete | Yes | Audit report link |

#### Milestone 4: Closeout (Week 24)

| Metric | Target | Verification Query |
|--------|--------|-------------------|
| Total users | 150+ | `uniqueMembers` |
| Total circles | 50+ | `totalCircles` |
| TVL | $50,000+ | `totalEscrowLocked / 1e6` |
| Default rate | <3% | `defaultRate` |
| SDK published | Yes | npm link |
| Open source | Yes | GitHub public |

### 5.3 Verification Snapshots

At each milestone deadline, a verification snapshot is generated:

```json
// milestone_2_verification.json
{
  "milestone": 2,
  "timestamp": "2026-04-15T00:00:00Z",
  "blockNumber": 12345678,
  "metrics": {
    "totalMembers": 52,
    "activeCircles": 18,
    "completedCircles": 7,
    "tvl": "12500000000",  // $12,500 (in USDC decimals)
    "defaultRate": "0.028",  // 2.8%
    "totalVolume": "45000000000"  // $45,000
  },
  "targets": {
    "totalMembers": { "target": 50, "met": true },
    "circles": { "target": 15, "met": true },
    "tvl": { "target": "10000000000", "met": true },
    "defaultRate": { "target": "0.05", "met": true }
  },
  "verification": {
    "subgraphEndpoint": "https://api.thegraph.com/subgraphs/name/xxixlabs/halo",
    "dashboardUrl": "https://dune.com/xxixlabs/halo",
    "blockExplorer": "https://arbiscan.io/address/0x..."
  }
}
```

---

## 6. SDK Integration

### 6.1 SDK Overview

```typescript
// @halo-protocol/sdk

import { HaloSDK, Circle, Member, CreditScore } from '@halo-protocol/sdk';

// Initialize
const halo = new HaloSDK({
  network: 'arbitrum',
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/xxixlabs/halo',
});

// Query credit score
const score = await halo.getCreditScore('0x...');
console.log(score.value);  // 650
console.log(score.tier);   // "GOOD"

// Get circles for user
const circles = await halo.getCircles({ member: '0x...' });

// Get protocol stats
const stats = await halo.getProtocolStats();
console.log(stats.tvl);           // BigNumber
console.log(stats.activeCircles); // 15
console.log(stats.defaultRate);   // 0.028
```

### 6.2 SDK Methods

```typescript
// sdk/src/index.ts

export interface HaloSDK {
  // Credit Score
  getCreditScore(address: string): Promise<CreditScoreResponse>;
  getScoreHistory(address: string, options?: PaginationOptions): Promise<ScoreEvent[]>;
  getScoreTier(score: number): ScoreTier;
  
  // Circles
  getCircle(circleId: string): Promise<Circle>;
  getCircles(options?: CircleQueryOptions): Promise<Circle[]>;
  getActiveCircles(): Promise<Circle[]>;
  
  // Members
  getMember(address: string): Promise<Member>;
  getMemberCircles(address: string): Promise<Participation[]>;
  isBlacklisted(address: string): Promise<boolean>;
  
  // Protocol
  getProtocolStats(): Promise<ProtocolMetrics>;
  getDailyStats(startDate: Date, endDate: Date): Promise<DailyMetrics[]>;
  
  // Verification
  verifyMilestone(milestone: number): Promise<MilestoneVerification>;
}

export interface CreditScoreResponse {
  address: string;
  value: number;
  tier: ScoreTier;
  lastUpdated: Date;
  history: ScoreEvent[];
}

export type ScoreTier = 'POOR' | 'FAIR' | 'NEUTRAL' | 'GOOD' | 'EXCELLENT' | 'ELITE';

export interface CircleQueryOptions {
  member?: string;
  organizer?: string;
  status?: CircleStatus[];
  minContribution?: BigNumber;
  maxContribution?: BigNumber;
  first?: number;
  skip?: number;
}
```

### 6.3 Integration Example

```typescript
// Example: Lending protocol integration

import { HaloSDK } from '@halo-protocol/sdk';

class LendingProtocol {
  private halo: HaloSDK;
  
  constructor() {
    this.halo = new HaloSDK({ network: 'arbitrum' });
  }
  
  async getCollateralRatio(borrower: string): Promise<number> {
    const score = await this.halo.getCreditScore(borrower);
    
    // Tier-based collateral ratios
    const ratios = {
      ELITE: 80,
      EXCELLENT: 110,
      GOOD: 130,
      NEUTRAL: 150,
      FAIR: 200,
      POOR: Infinity,  // Not eligible
    };
    
    return ratios[score.tier];
  }
  
  async canBorrow(borrower: string, amount: BigNumber): Promise<boolean> {
    const score = await this.halo.getCreditScore(borrower);
    const isBlacklisted = await this.halo.isBlacklisted(borrower);
    
    if (isBlacklisted) return false;
    if (score.value < 500) return false;
    
    // Check lending limits based on score
    const maxLoan = this.getMaxLoan(score.tier);
    return amount.lte(maxLoan);
  }
}
```

---

## 7. Analytics & Reporting

### 7.1 Automated Reports

Weekly report generated automatically:

```markdown
# Halo Protocol Weekly Report
**Week of February 17-23, 2026**

## Key Metrics

| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| TVL | $52,000 | $45,000 | +15.6% |
| Active Circles | 18 | 15 | +20% |
| New Users | 25 | 20 | +25% |
| Volume | $15,000 | $12,000 | +25% |
| Default Rate | 2.5% | 3.1% | -19% |

## Highlights

- 🎉 TVL crossed $50,000 milestone
- 📈 Default rate improved to 2.5%
- 👥 25 new users onboarded

## Concerns

- None this week

## Next Week Goals

- Target 100 total users
- Launch SDK v1.0
```

### 7.2 Alert Configuration

```yaml
# alerts.yaml

alerts:
  - name: high_default_rate
    condition: default_rate > 0.05
    severity: warning
    notify: [slack, email]
    
  - name: critical_default_rate
    condition: default_rate > 0.10
    severity: critical
    notify: [pagerduty, slack, email]
    
  - name: tvl_drop
    condition: tvl_change_24h < -0.20
    severity: warning
    notify: [slack]
    
  - name: pause_detected
    condition: contract_paused == true
    severity: critical
    notify: [pagerduty, slack, email]
    
  - name: milestone_at_risk
    condition: |
      (milestone_deadline - now < 7_days) AND
      (current_metric < target_metric * 0.8)
    severity: warning
    notify: [slack, email]
```

### 7.3 Compliance Reporting

```sql
-- Monthly compliance report data

-- Total transaction count
SELECT COUNT(*) as total_transactions
FROM halo_protocol.payments
WHERE block_time >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
AND block_time < DATE_TRUNC('month', NOW());

-- Large transactions (>$1000)
SELECT 
    member_address,
    circle_id,
    amount / 1e6 as amount_usd,
    block_time
FROM halo_protocol.payments
WHERE amount > 1000e6
AND block_time >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
ORDER BY amount DESC;

-- Blacklisted users
SELECT
    member_address,
    blacklisted_at,
    reason
FROM halo_protocol.blacklist
WHERE blacklisted_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month');
```

---

## Appendix: Query Reference

### Common GraphQL Queries

```graphql
# Get protocol overview
query ProtocolOverview {
  protocolMetrics(id: "protocol") {
    totalCircles
    activeCircles
    completedCircles
    totalMembers
    totalVolume
    totalEscrowLocked
    defaultRate
    averageScore
  }
}

# Get user profile
query UserProfile($address: ID!) {
  member(id: $address) {
    creditScore
    totalCirclesJoined
    totalCirclesCompleted
    totalContributed
    totalReceived
    softDefaults
    hardDefaults
    isBlacklisted
    circles {
      circle {
        id
        status
        contributionAmount
      }
      role
      paymentsMade
      paymentsOnTime
    }
  }
}

# Get recent circles
query RecentCircles($first: Int!, $skip: Int!) {
  circles(
    first: $first
    skip: $skip
    orderBy: createdAt
    orderDirection: desc
  ) {
    id
    organizer { address }
    contributionAmount
    memberCount
    status
    totalVolume
    createdAt
  }
}

# Get score history
query ScoreHistory($address: ID!, $first: Int!) {
  creditEvents(
    where: { member: $address }
    first: $first
    orderBy: timestamp
    orderDirection: desc
  ) {
    eventType
    pointsDelta
    scoreAfter
    reason
    timestamp
  }
}
```

---

**Document Version:** 1.0.0  
**Author:** XXIX Labs  
**Review Status:** Draft

