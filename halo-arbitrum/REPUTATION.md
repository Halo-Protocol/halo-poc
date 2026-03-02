# Halo Protocol — Reputation Specification

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Status:** Draft for Review

---

## Table of Contents

1. [Overview](#1-overview)
2. [Credit Score Model](#2-credit-score-model)
3. [Score Components](#3-score-components)
4. [Input Sources](#4-input-sources)
5. [Attestation System](#5-attestation-system)
6. [Score Decay](#6-score-decay)
7. [Penalty System](#7-penalty-system)
8. [Sybil Resistance](#8-sybil-resistance)
9. [Privacy Considerations](#9-privacy-considerations)
10. [Smart Contract Implementation](#10-smart-contract-implementation)

---

## 1. Overview

The Halo Score is an on-chain credit reputation derived from verifiable financial behavior. Unlike traditional credit scores that rely on centralized bureaus, Halo Scores are:

- **Transparent:** Calculation logic is open source
- **Portable:** Score follows the wallet across protocols
- **Privacy-preserving:** Raw data stays local, only score published
- **Tamper-proof:** Built on immutable blockchain events

### 1.1 Design Principles

| Principle | Implementation |
|-----------|---------------|
| Earned, not purchased | Score based on behavior, not deposits |
| Forgiveness over punishment | Decay allows recovery from past mistakes |
| Sybil-resistant | Multiple identity verification layers |
| Composable | SDK enables integration by other protocols |

### 1.2 Score Range

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HALO SCORE RANGE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   300         400         500         600         700         800      850  │
│    │           │           │           │           │           │         │  │
│    ▼           ▼           ▼           ▼           ▼           ▼         ▼  │
│   ┌───────────┬───────────┬───────────┬───────────┬───────────┬─────────┐  │
│   │   POOR    │   FAIR    │  NEUTRAL  │   GOOD    │ EXCELLENT │  ELITE  │  │
│   │           │           │           │           │           │         │  │
│   │ No access │ Limited   │ Standard  │ Preferred │ Premium   │ VIP     │  │
│   │ to circles│ circles   │ circles   │ benefits  │ access    │ access  │  │
│   └───────────┴───────────┴───────────┴───────────┴───────────┴─────────┘  │
│                                                                             │
│   Default starting score: 500 (NEUTRAL)                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Credit Score Model

### 2.1 Scoring Formula

```solidity
// Halo Score Calculation
haloScore = baseScore 
    + paymentHistoryScore      // 40% weight
    + circleCompletionScore    // 25% weight
    + accountAgeScore          // 15% weight
    + volumeDiversityScore     // 10% weight
    + networkTrustScore        // 10% weight
```

### 2.2 Score Bounds

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Minimum Score | 300 | Floor prevents complete exclusion |
| Maximum Score | 850 | Familiar scale (mirrors FICO) |
| Starting Score | 500 | Neutral position for new users |
| Score Precision | 1 point | Integer scores for simplicity |

### 2.3 Score Tiers & Benefits

| Tier | Score Range | Circle Access | Lending Access | Collateral Ratio |
|------|-------------|---------------|----------------|------------------|
| Poor | 300-399 | None | None | N/A |
| Fair | 400-499 | Limited ($100 max) | None | N/A |
| Neutral | 500-599 | Standard ($1,000 max) | Basic | 150% |
| Good | 600-699 | Enhanced ($5,000 max) | Standard | 130% |
| Excellent | 700-799 | Premium ($10,000 max) | Premium | 110% |
| Elite | 800-850 | Unlimited | VIP | 80% |

---

## 3. Score Components

### 3.1 Payment History (40% Weight)

The most important factor — demonstrates consistent financial behavior.

**Inputs:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT HISTORY SCORING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Event                    Points      Cap          Notes                  │
│   ─────                    ──────      ───          ─────                  │
│                                                                             │
│   On-time payment          +10         None         Per contribution       │
│   Early payment (>24h)     +12         None         Bonus for proactive   │
│   Late (within grace)      +5          None         Reduced credit         │
│   Soft default             -20         None         Escrow covered         │
│   Hard default             -50         None         Escrow depleted        │
│                                                                             │
│   STREAKS:                                                                 │
│   5 consecutive on-time    +15 bonus   1x per 5     Rewards consistency   │
│   10 consecutive on-time   +30 bonus   1x per 10    Elite behavior        │
│   20 consecutive on-time   +50 bonus   1x per 20    Exceptional           │
│                                                                             │
│   PERFECT CIRCLE:                                                          │
│   All payments on-time     +25 bonus   Per circle   Completion reward     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Calculation:**
```solidity
function calculatePaymentHistoryScore(address member) internal view returns (uint256) {
    PaymentRecord[] memory payments = getPaymentHistory(member);
    
    int256 rawScore = 0;
    uint256 streak = 0;
    
    for (uint256 i = 0; i < payments.length; i++) {
        PaymentRecord memory p = payments[i];
        
        if (p.status == PaymentStatus.ON_TIME) {
            rawScore += 10;
            streak++;
            
            // Streak bonuses
            if (streak == 5) rawScore += 15;
            if (streak == 10) rawScore += 30;
            if (streak == 20) rawScore += 50;
            
        } else if (p.status == PaymentStatus.EARLY) {
            rawScore += 12;
            streak++;
            
        } else if (p.status == PaymentStatus.LATE_GRACE) {
            rawScore += 5;
            streak = 0;  // Breaks streak
            
        } else if (p.status == PaymentStatus.SOFT_DEFAULT) {
            rawScore -= 20;
            streak = 0;
            
        } else if (p.status == PaymentStatus.HARD_DEFAULT) {
            rawScore -= 50;
            streak = 0;
        }
        
        // Apply time decay
        rawScore = applyDecay(rawScore, p.timestamp);
    }
    
    // Add circle completion bonuses
    uint256 perfectCircles = countPerfectCircles(member);
    rawScore += int256(perfectCircles * 25);
    
    // Normalize to component range (0-220 for 40% of 550 possible points)
    return normalizeScore(rawScore, 0, 220);
}
```

### 3.2 Circle Completion (25% Weight)

Measures follow-through on commitments.

**Inputs:**

| Metric | Points | Notes |
|--------|--------|-------|
| Circle completed (as member) | +25 | Per completed circle |
| Circle completed (as organizer) | +35 | Higher responsibility |
| Circle abandoned (left early) | -30 | Breaking commitment |
| Circle cancelled (as organizer) | -15 | Organizing failure |
| Circles in progress | 0 | No credit until complete |

**Calculation:**
```solidity
function calculateCircleCompletionScore(address member) internal view returns (uint256) {
    CircleParticipation[] memory circles = getCircleHistory(member);
    
    int256 rawScore = 0;
    
    for (uint256 i = 0; i < circles.length; i++) {
        CircleParticipation memory c = circles[i];
        
        if (c.status == CircleStatus.COMPLETED) {
            if (c.role == Role.ORGANIZER) {
                rawScore += 35;
            } else {
                rawScore += 25;
            }
        } else if (c.status == CircleStatus.ABANDONED) {
            rawScore -= 30;
        } else if (c.status == CircleStatus.CANCELLED && c.role == Role.ORGANIZER) {
            rawScore -= 15;
        }
        
        // Apply decay
        rawScore = applyDecay(rawScore, c.endTimestamp);
    }
    
    // Normalize to component range (0-137 for 25% of 550 possible points)
    return normalizeScore(rawScore, 0, 137);
}
```

### 3.3 Account Age (15% Weight)

Rewards longevity and consistency.

**Inputs:**

| Metric | Points | Cap |
|--------|--------|-----|
| Days since first circle | +0.1/day | 100 max (1000 days) |
| Months with activity | +5/month | 60 max (12 months) |
| Inactive penalty | -2/month | After 60 days inactivity |

**Calculation:**
```solidity
function calculateAccountAgeScore(address member) internal view returns (uint256) {
    AccountInfo memory info = getAccountInfo(member);
    
    // Days since first activity
    uint256 daysSinceFirst = (block.timestamp - info.firstActivityTimestamp) / 1 days;
    uint256 dayPoints = min(daysSinceFirst / 10, 100);  // 0.1 pts/day, max 100
    
    // Active months
    uint256 activeMonths = countActiveMonths(member);
    uint256 monthPoints = min(activeMonths * 5, 60);  // 5 pts/month, max 60
    
    // Inactivity penalty
    uint256 daysSinceActivity = (block.timestamp - info.lastActivityTimestamp) / 1 days;
    int256 inactivityPenalty = 0;
    if (daysSinceActivity > 60) {
        uint256 inactiveMonths = (daysSinceActivity - 60) / 30;
        inactivityPenalty = -int256(min(inactiveMonths * 2, 20));  // -2/month, max -20
    }
    
    int256 rawScore = int256(dayPoints + monthPoints) + inactivityPenalty;
    
    // Normalize to component range (0-82 for 15% of 550 possible points)
    return normalizeScore(rawScore, 0, 82);
}
```

### 3.4 Volume & Diversity (10% Weight)

Measures breadth of participation.

**Inputs:**

| Metric | Points | Cap |
|--------|--------|-----|
| Total USD transacted | +1 per $100 | 30 max |
| Unique circles joined | +3 per circle | 30 max |
| Circle size diversity | +5 per size tier | 15 max |

**Calculation:**
```solidity
function calculateVolumeDiversityScore(address member) internal view returns (uint256) {
    VolumeStats memory stats = getVolumeStats(member);
    
    // Volume points
    uint256 volumePoints = min(stats.totalUsdVolume / 100e6, 30);  // $100 increments
    
    // Diversity points
    uint256 uniqueCircles = stats.uniqueCirclesJoined;
    uint256 diversityPoints = min(uniqueCircles * 3, 30);
    
    // Size diversity (3-4 members, 5-6 members, 7-10 members)
    uint256 sizeTiers = countSizeTiers(member);
    uint256 sizePoints = min(sizeTiers * 5, 15);
    
    uint256 rawScore = volumePoints + diversityPoints + sizePoints;
    
    // Normalize to component range (0-55 for 10% of 550 possible points)
    return normalizeScore(rawScore, 0, 55);
}
```

### 3.5 Network Trust (10% Weight)

Social reputation from peer interactions.

**Inputs:**

| Metric | Points | Cap |
|--------|--------|-----|
| Vouch from 700+ score user | +5 | 25 max (5 vouches) |
| Vouch from 600-699 user | +3 | 15 max (5 vouches) |
| Completed circle together | +2 per co-member | 20 max |
| Received verified warning | -10 | No cap |
| Received verified fraud report | -50 | No cap |

**Calculation:**
```solidity
function calculateNetworkTrustScore(address member) internal view returns (uint256) {
    // Vouches
    Vouch[] memory vouches = getVouches(member);
    int256 vouchPoints = 0;
    
    for (uint256 i = 0; i < vouches.length && vouchPoints < 40; i++) {
        uint256 voucherScore = creditScore.getScore(vouches[i].voucher);
        
        if (voucherScore >= 700) {
            vouchPoints += 5;
        } else if (voucherScore >= 600) {
            vouchPoints += 3;
        }
        // Vouches from <600 users don't count
    }
    
    // Co-membership
    uint256 coMembers = countUniqueCoMembers(member);
    int256 coMemberPoints = int256(min(coMembers * 2, 20));
    
    // Warnings and reports
    uint256 warnings = getVerifiedWarnings(member);
    uint256 fraudReports = getVerifiedFraudReports(member);
    
    int256 negativePoints = -int256(warnings * 10 + fraudReports * 50);
    
    int256 rawScore = vouchPoints + coMemberPoints + negativePoints;
    
    // Normalize to component range (0-55 for 10% of 550 possible points)
    return normalizeScore(rawScore, 0, 55);
}
```

---

## 4. Input Sources

### 4.1 On-Chain Inputs (Primary)

All primary inputs come from verified on-chain events:

```solidity
// Payment events
event ContributionMade(
    address indexed member,
    uint256 indexed circleId,
    uint256 indexed roundId,
    uint256 amount,
    PaymentTiming timing  // EARLY, ON_TIME, LATE_GRACE
);

// Default events
event DefaultRecorded(
    address indexed member,
    uint256 indexed circleId,
    DefaultType defaultType,  // SOFT, HARD
    uint256 amountLost
);

// Circle events
event CircleCompleted(
    uint256 indexed circleId,
    address[] members,
    uint256 totalVolume
);

// Attestation events
event AttestationCreated(
    bytes32 indexed attestationId,
    address indexed subject,
    address indexed attester,
    AttestationType attestType,
    int256 impact
);
```

### 4.2 Off-Chain Inputs (Future)

Phase 3+ may incorporate verified off-chain data:

| Source | Data Type | Verification Method |
|--------|-----------|---------------------|
| Bank statements | Payment history | Plaid + ZK proof |
| Utility bills | Payment consistency | TLS notary |
| Employer verification | Income stability | Encrypted attestation |
| Tax records | Financial capacity | ZK proof of range |

> **Note:** Off-chain integrations are NOT in grant scope.

---

## 5. Attestation System

### 5.1 Attestation Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATTESTATION TYPES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Type              Impact      Decay       Requirements                   │
│   ────              ──────      ─────       ────────────                   │
│                                                                             │
│   VOUCH             +3 to +5    12 months   Attester score ≥600            │
│   • Endorsement of trustworthiness                                         │
│   • Attester stakes reputation                                              │
│                                                                             │
│   CIRCLE_COMPLETE   +2          24 months   System-generated               │
│   • Automatic when circle completes                                         │
│   • One per co-member                                                       │
│                                                                             │
│   WARN              -10         18 months   Verified by dispute resolution │
│   • Reports problematic behavior                                            │
│   • Requires evidence submission                                            │
│                                                                             │
│   FRAUD_REPORT      -50         36 months   Verified by governance         │
│   • Serious allegation                                                      │
│   • Requires multi-sig approval                                             │
│   • Can trigger permanent blacklist                                         │
│                                                                             │
│   ORGANIZER_BADGE   +10         Never       Earned through organizing       │
│   • Successfully organized 3+ circles                                       │
│   • Permanent reputation boost                                              │
│                                                                             │
│   PERFECT_RECORD    +15         Never       Earned through perfection       │
│   • 10+ circles with zero defaults                                          │
│   • Permanent badge                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Attestation Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@ethereum-attestation-service/contracts/IEAS.sol";

contract HaloAttestations {
    
    IEAS public immutable eas;
    bytes32 public immutable vouchSchema;
    bytes32 public immutable warnSchema;
    bytes32 public immutable badgeSchema;
    
    struct AttestationRecord {
        bytes32 id;
        address attester;
        address subject;
        AttestationType attestType;
        int256 scoreImpact;
        uint256 timestamp;
        uint256 decayMonths;
        bool revoked;
    }
    
    mapping(address => AttestationRecord[]) public attestations;
    mapping(address => mapping(address => bool)) public hasVouched;
    
    // Vouch limits
    uint256 public constant MAX_VOUCHES_RECEIVED = 10;
    uint256 public constant MAX_VOUCHES_GIVEN = 20;
    uint256 public constant VOUCH_COOLDOWN = 30 days;
    
    event VouchCreated(address indexed voucher, address indexed subject, int256 impact);
    event WarnSubmitted(address indexed reporter, address indexed subject, string evidence);
    event BadgeEarned(address indexed member, BadgeType badge);
    
    function vouch(address subject) external returns (bytes32 attestationId) {
        require(msg.sender != subject, "Cannot vouch for self");
        require(!hasVouched[msg.sender][subject], "Already vouched");
        require(creditScore.getScore(msg.sender) >= 600, "Insufficient score to vouch");
        
        // Check vouch limits
        require(
            countVouchesReceived(subject) < MAX_VOUCHES_RECEIVED,
            "Subject has max vouches"
        );
        require(
            countVouchesGiven(msg.sender) < MAX_VOUCHES_GIVEN,
            "You've given max vouches"
        );
        
        // Calculate impact based on voucher score
        int256 impact;
        uint256 voucherScore = creditScore.getScore(msg.sender);
        
        if (voucherScore >= 700) {
            impact = 5;
        } else {
            impact = 3;
        }
        
        // Create EAS attestation
        bytes memory data = abi.encode(subject, impact, "VOUCH");
        attestationId = eas.attest(
            AttestationRequest({
                schema: vouchSchema,
                data: AttestationRequestData({
                    recipient: subject,
                    expirationTime: 0,
                    revocable: true,
                    refUID: bytes32(0),
                    data: data,
                    value: 0
                })
            })
        );
        
        // Record attestation
        attestations[subject].push(AttestationRecord({
            id: attestationId,
            attester: msg.sender,
            subject: subject,
            attestType: AttestationType.VOUCH,
            scoreImpact: impact,
            timestamp: block.timestamp,
            decayMonths: 12,
            revoked: false
        }));
        
        hasVouched[msg.sender][subject] = true;
        
        // Update credit score
        creditScore.addAttestation(subject, impact, 12, "Vouch received");
        
        emit VouchCreated(msg.sender, subject, impact);
        
        return attestationId;
    }
    
    function revokeVouch(address subject) external {
        require(hasVouched[msg.sender][subject], "No vouch to revoke");
        
        // Find and revoke attestation
        AttestationRecord[] storage records = attestations[subject];
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].attester == msg.sender && 
                records[i].attestType == AttestationType.VOUCH &&
                !records[i].revoked) {
                
                records[i].revoked = true;
                
                // Revoke in EAS
                eas.revoke(
                    RevocationRequest({
                        schema: vouchSchema,
                        data: RevocationRequestData({
                            uid: records[i].id,
                            value: 0
                        })
                    })
                );
                
                // Remove from credit score
                creditScore.removeAttestation(subject, records[i].scoreImpact, "Vouch revoked");
                
                hasVouched[msg.sender][subject] = false;
                
                break;
            }
        }
    }
    
    function submitWarning(
        address subject,
        string calldata evidence,
        bytes32[] calldata supportingDocs
    ) external returns (bytes32) {
        require(msg.sender != subject, "Cannot warn self");
        require(creditScore.getScore(msg.sender) >= 500, "Insufficient score to warn");
        
        // Stake reputation to prevent spam
        uint256 stakeRequired = 50;  // Points at risk if warning is frivolous
        require(
            creditScore.getScore(msg.sender) >= 500 + stakeRequired,
            "Insufficient score buffer for stake"
        );
        
        // Create pending warning
        bytes32 warningId = keccak256(
            abi.encodePacked(msg.sender, subject, evidence, block.timestamp)
        );
        
        pendingWarnings[warningId] = PendingWarning({
            reporter: msg.sender,
            subject: subject,
            evidence: evidence,
            supportingDocs: supportingDocs,
            timestamp: block.timestamp,
            status: WarningStatus.PENDING
        });
        
        emit WarnSubmitted(msg.sender, subject, evidence);
        
        return warningId;
    }
    
    function resolveWarning(
        bytes32 warningId,
        bool isValid
    ) external onlyDisputeResolver {
        PendingWarning storage warning = pendingWarnings[warningId];
        require(warning.status == WarningStatus.PENDING, "Already resolved");
        
        if (isValid) {
            // Apply warning to subject
            attestations[warning.subject].push(AttestationRecord({
                id: warningId,
                attester: warning.reporter,
                subject: warning.subject,
                attestType: AttestationType.WARN,
                scoreImpact: -10,
                timestamp: block.timestamp,
                decayMonths: 18,
                revoked: false
            }));
            
            creditScore.adjustScore(warning.subject, -10, "Verified warning");
            warning.status = WarningStatus.VALIDATED;
            
        } else {
            // Penalize frivolous reporter
            creditScore.adjustScore(warning.reporter, -25, "Frivolous warning");
            warning.status = WarningStatus.REJECTED;
        }
    }
    
    function checkAndAwardBadges(address member) external {
        // Organizer badge
        if (countSuccessfullyOrganized(member) >= 3 && !hasBadge(member, BadgeType.ORGANIZER)) {
            _awardBadge(member, BadgeType.ORGANIZER, 10);
        }
        
        // Perfect record badge
        if (countCirclesWithNoDefaults(member) >= 10 && !hasBadge(member, BadgeType.PERFECT_RECORD)) {
            _awardBadge(member, BadgeType.PERFECT_RECORD, 15);
        }
        
        // Elite badge
        if (creditScore.getScore(member) >= 800 && !hasBadge(member, BadgeType.ELITE)) {
            _awardBadge(member, BadgeType.ELITE, 0);  // Recognition only
        }
    }
    
    function _awardBadge(address member, BadgeType badge, int256 scoreBonus) internal {
        badges[member][badge] = true;
        
        if (scoreBonus > 0) {
            creditScore.adjustScore(member, scoreBonus, string(abi.encodePacked("Badge: ", badge)));
        }
        
        emit BadgeEarned(member, badge);
    }
}
```

### 5.3 Attestation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VOUCH ATTESTATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   VOUCHER                    SYSTEM                       SUBJECT          │
│   (Score ≥600)                                                             │
│       │                                                                     │
│       │ 1. vouch(subject)                                                   │
│       ├─────────────────────▶│                                             │
│       │                      │                                             │
│       │                      │ 2. Validate:                                │
│       │                      │    - Voucher score ≥600                     │
│       │                      │    - Not already vouched                    │
│       │                      │    - Subject not at max                     │
│       │                      │                                             │
│       │                      │ 3. Create EAS attestation                   │
│       │                      ├─────────────────────▶ EAS                   │
│       │                      │                                             │
│       │                      │ 4. Record attestation                       │
│       │                      │                                             │
│       │                      │ 5. Update credit score ──────────▶│        │
│       │                      │    +3 to +5 points                │        │
│       │                      │                                   │        │
│       │◀─────────────────────│                                   │        │
│       │ 6. Return attestationId                                  │        │
│                                                                   │        │
│                                                                   ▼        │
│                                                          ┌──────────────┐  │
│                                                          │ Score +3/+5  │  │
│                                                          │ Decays in    │  │
│                                                          │ 12 months    │  │
│                                                          └──────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Score Decay

### 6.1 Decay Philosophy

Credit scores should reflect current behavior, not permanent history. Decay allows users to recover from past mistakes while maintaining accountability.

### 6.2 Decay Schedule

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCORE DECAY SCHEDULE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Event Age              Weight Applied    Example                         │
│   ─────────              ──────────────    ───────                         │
│                                                                             │
│   0 - 6 months           100%              +10 → +10                       │
│   6 - 12 months          80%               +10 → +8                        │
│   12 - 24 months         50%               +10 → +5                        │
│   24+ months             25%               +10 → +2.5                      │
│                                                                             │
│   ────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   INACTIVITY DECAY:                                                         │
│   ─────────────────                                                         │
│                                                                             │
│   Active (30 days)       100% (no decay)                                   │
│   Inactive 30-90 days    95%                                               │
│   Inactive 90-180 days   85%                                               │
│   Inactive 180+ days     75%                                               │
│                                                                             │
│   ────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   MEAN REVERSION:                                                           │
│   ───────────────                                                           │
│                                                                             │
│   Scores gradually drift toward 500 (neutral) during inactivity            │
│   Rate: 5 points per month toward 500                                      │
│   Floor/Ceiling: Never crosses 500 due to drift                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Decay Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library ScoreDecay {
    
    uint256 constant FULL_WEIGHT_PERIOD = 180 days;      // 6 months
    uint256 constant DECAY_PERIOD_1 = 365 days;          // 12 months
    uint256 constant DECAY_PERIOD_2 = 730 days;          // 24 months
    
    uint256 constant WEIGHT_FULL = 100;
    uint256 constant WEIGHT_6_12 = 80;
    uint256 constant WEIGHT_12_24 = 50;
    uint256 constant WEIGHT_24_PLUS = 25;
    
    function getDecayWeight(uint256 eventTimestamp) internal view returns (uint256) {
        uint256 age = block.timestamp - eventTimestamp;
        
        if (age <= FULL_WEIGHT_PERIOD) {
            return WEIGHT_FULL;
        } else if (age <= DECAY_PERIOD_1) {
            return WEIGHT_6_12;
        } else if (age <= DECAY_PERIOD_2) {
            return WEIGHT_12_24;
        } else {
            return WEIGHT_24_PLUS;
        }
    }
    
    function applyDecay(int256 points, uint256 eventTimestamp) internal view returns (int256) {
        uint256 weight = getDecayWeight(eventTimestamp);
        return (points * int256(weight)) / 100;
    }
    
    function getInactivityMultiplier(uint256 lastActivityTimestamp) internal view returns (uint256) {
        uint256 inactiveDays = (block.timestamp - lastActivityTimestamp) / 1 days;
        
        if (inactiveDays <= 30) {
            return 100;  // No decay
        } else if (inactiveDays <= 90) {
            return 95;
        } else if (inactiveDays <= 180) {
            return 85;
        } else {
            return 75;
        }
    }
    
    function calculateMeanReversion(
        uint256 currentScore,
        uint256 lastActivityTimestamp
    ) internal view returns (int256 drift) {
        uint256 inactiveMonths = (block.timestamp - lastActivityTimestamp) / 30 days;
        
        if (inactiveMonths == 0) return 0;
        
        int256 distanceFromNeutral = int256(currentScore) - 500;
        int256 maxDrift = (distanceFromNeutral * int256(inactiveMonths) * 5) / int256(currentScore);
        
        // Cap drift to not cross neutral
        if (distanceFromNeutral > 0) {
            drift = -min(uint256(maxDrift), uint256(distanceFromNeutral));
        } else if (distanceFromNeutral < 0) {
            drift = min(uint256(-maxDrift), uint256(-distanceFromNeutral));
        }
        
        return drift;
    }
}
```

### 6.4 Decay Visualization

```
Score Impact Over Time (Example: +10 on-time payment)

Points │
  10   │████████████████████████████████████
   8   │                                    ████████████████████
   5   │                                                        ██████████████████
 2.5   │                                                                          ██████
       └──────────────────────────────────────────────────────────────────────────────────▶
           0         6 months      12 months      24 months      36 months        Time

Score Drift During Inactivity (Starting score: 700)

Score  │
  700  │█████████
  695  │         █████████
  685  │                  █████████
  675  │                           █████████
       └──────────────────────────────────────────────────▶
           0        30 days    60 days    90 days   Time (inactive)
```

---

## 7. Penalty System

### 7.1 Penalty Categories

| Category | Severity | Score Impact | Recovery Time |
|----------|----------|--------------|---------------|
| **Minor** | Warning | 0 to -10 | Immediate |
| **Moderate** | Soft default, late payment | -10 to -30 | 6-12 months |
| **Severe** | Hard default, abandonment | -30 to -50 | 12-18 months |
| **Critical** | Fraud, multiple defaults | -50 to -200 | 18-36 months |
| **Permanent** | Verified fraud | Blacklist | Never |

### 7.2 Penalty Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PENALTY MATRIX                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Offense                First    Second   Third    Additional             │
│   ───────                ─────    ──────   ─────    ──────────             │
│                                                                             │
│   Late payment           +5       +3       +0       Warning                │
│   (within grace)                                                            │
│                                                                             │
│   Soft default           -20      -25      -30      +Strike                │
│   (escrow covers)                                                           │
│                                                                             │
│   Hard default           -50      -75      -100     +90d blacklist         │
│   (escrow depleted)                                   each                  │
│                                                                             │
│   Circle abandonment     -30      -40      -50      +60d blacklist         │
│                                                       each                  │
│                                                                             │
│   3 strikes (12mo)       -100     N/A      N/A      +180d blacklist        │
│                                                                             │
│   Verified warning       -10      -15      -20      Review for fraud       │
│                                                                             │
│   Verified fraud         -200     N/A      N/A      Permanent blacklist    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Recovery Path

```
Recovery Example: User at 350 score after hard default

Timeline to Good Standing (600+):

Month 0:    Score 350 (Hard default occurred)
            └── 90-day blacklist active
            
Month 3:    Score 350 (Blacklist expires)
            └── Can join limited circles ($100 max)
            
Month 6:    Score 410 (+60 from 6 on-time payments)
            └── Still Fair tier
            
Month 9:    Score 480 (+70 from continued payments + 1 circle complete)
            └── Approaching Neutral tier
            
Month 12:   Score 550 (+70 from payments + streak bonus)
            └── Neutral tier unlocked
            
Month 18:   Score 620 (+70 from sustained behavior)
            └── Good tier achieved

Total recovery time: ~18 months of consistent good behavior
```

---

## 8. Sybil Resistance

### 8.1 Multi-Layer Defense

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYBIL RESISTANCE LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   LAYER 1: IDENTITY VERIFICATION                                           │
│   ───────────────────────────────                                           │
│   • Worldcoin (proof of humanity via iris scan)                            │
│   • Gitcoin Passport (composite identity score)                            │
│   • KYC provider (Persona, Jumio) for high-value access                   │
│   • Minimum one verification required                                       │
│                                                                             │
│   LAYER 2: ECONOMIC BARRIERS                                               │
│   ─────────────────────────                                                 │
│   • 100% escrow creates real capital cost per identity                     │
│   • Minimum contribution: $10 (not worth gaming for score alone)          │
│   • Gas costs on Arbitrum (~$0.01-0.10) add friction                       │
│   • Opportunity cost of locked capital                                      │
│                                                                             │
│   LAYER 3: SOCIAL GRAPH ANALYSIS                                           │
│   ─────────────────────────────                                             │
│   • Track co-membership patterns                                            │
│   • Flag circles with >50% new accounts                                     │
│   • Detect wallet clustering (common funding source)                        │
│   • Monitor for circular vouch networks                                     │
│                                                                             │
│   LAYER 4: BEHAVIORAL HEURISTICS                                           │
│   ─────────────────────────────                                             │
│   • New accounts: max 1 circle, $500 limit                                 │
│   • Rate limiting: max 3 circles joined per week                           │
│   • Score farming detection: flag rapid, minimal interactions              │
│   • Geographic clustering analysis                                          │
│                                                                             │
│   LAYER 5: REPUTATION AT STAKE                                             │
│   ──────────────────────────────                                            │
│   • Vouching stakes attester's reputation                                   │
│   • False vouches result in penalty to voucher                              │
│   • Organizers accountable for circle composition                           │
│   • Long-term value of score incentivizes protection                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Identity Verification Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IWorldcoinVerifier {
    function verifyProof(
        uint256 root,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external returns (bool);
}

interface IGitcoinPassport {
    function getScore(address user) external view returns (uint256);
}

contract IdentityVerifier {
    
    IWorldcoinVerifier public worldcoin;
    IGitcoinPassport public gitcoinPassport;
    
    uint256 public constant GITCOIN_MIN_SCORE = 15;  // Minimum passport score
    
    enum VerificationType {
        NONE,
        WORLDCOIN,
        GITCOIN_PASSPORT,
        KYC_BASIC,
        KYC_FULL
    }
    
    struct IdentityRecord {
        VerificationType verificationType;
        bytes32 verificationHash;
        uint256 verifiedAt;
        bool isValid;
    }
    
    mapping(address => IdentityRecord) public identities;
    mapping(bytes32 => bool) public usedNullifiers;  // Prevent reuse
    
    event IdentityVerified(address indexed user, VerificationType verificationType);
    event IdentityRevoked(address indexed user, string reason);
    
    function verifyWithWorldcoin(
        uint256 root,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external returns (bool) {
        // Check nullifier not reused (prevents same person verifying multiple wallets)
        bytes32 nullifierKey = keccak256(abi.encodePacked(nullifierHash));
        require(!usedNullifiers[nullifierKey], "Nullifier already used");
        
        // Verify proof
        bool valid = worldcoin.verifyProof(
            root,
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
        );
        
        require(valid, "Invalid proof");
        
        // Record verification
        usedNullifiers[nullifierKey] = true;
        
        identities[msg.sender] = IdentityRecord({
            verificationType: VerificationType.WORLDCOIN,
            verificationHash: nullifierKey,
            verifiedAt: block.timestamp,
            isValid: true
        });
        
        emit IdentityVerified(msg.sender, VerificationType.WORLDCOIN);
        
        return true;
    }
    
    function verifyWithGitcoinPassport() external returns (bool) {
        uint256 score = gitcoinPassport.getScore(msg.sender);
        require(score >= GITCOIN_MIN_SCORE, "Insufficient passport score");
        
        identities[msg.sender] = IdentityRecord({
            verificationType: VerificationType.GITCOIN_PASSPORT,
            verificationHash: keccak256(abi.encodePacked(msg.sender, score, block.timestamp)),
            verifiedAt: block.timestamp,
            isValid: true
        });
        
        emit IdentityVerified(msg.sender, VerificationType.GITCOIN_PASSPORT);
        
        return true;
    }
    
    function isVerified(address user) external view returns (bool) {
        return identities[user].isValid;
    }
    
    function getVerificationType(address user) external view returns (VerificationType) {
        return identities[user].verificationType;
    }
    
    function getAccessLevel(address user) external view returns (uint256) {
        IdentityRecord storage record = identities[user];
        
        if (!record.isValid) return 0;
        
        if (record.verificationType == VerificationType.KYC_FULL) return 4;
        if (record.verificationType == VerificationType.KYC_BASIC) return 3;
        if (record.verificationType == VerificationType.WORLDCOIN) return 2;
        if (record.verificationType == VerificationType.GITCOIN_PASSPORT) return 1;
        
        return 0;
    }
}
```

### 8.3 Behavioral Analysis

```solidity
contract SybilDetector {
    
    struct UserBehavior {
        uint256 firstActivity;
        uint256 circlesJoined;
        uint256 circlesJoinedThisWeek;
        uint256 lastCircleJoinTime;
        address[] coMembers;
        uint256 flagCount;
    }
    
    mapping(address => UserBehavior) public behaviors;
    
    uint256 public constant NEW_ACCOUNT_AGE = 30 days;
    uint256 public constant NEW_ACCOUNT_MAX_CIRCLES = 1;
    uint256 public constant NEW_ACCOUNT_MAX_CONTRIBUTION = 500e6;  // $500
    uint256 public constant WEEKLY_CIRCLE_LIMIT = 3;
    
    function checkCircleJoin(
        address user,
        uint256 contributionAmount,
        address[] calldata otherMembers
    ) external returns (bool allowed, string memory reason) {
        UserBehavior storage behavior = behaviors[user];
        
        // New account restrictions
        if (block.timestamp - behavior.firstActivity < NEW_ACCOUNT_AGE) {
            if (behavior.circlesJoined >= NEW_ACCOUNT_MAX_CIRCLES) {
                return (false, "New account: max circles reached");
            }
            if (contributionAmount > NEW_ACCOUNT_MAX_CONTRIBUTION) {
                return (false, "New account: contribution too high");
            }
        }
        
        // Weekly rate limit
        if (behavior.circlesJoinedThisWeek >= WEEKLY_CIRCLE_LIMIT) {
            return (false, "Weekly circle limit reached");
        }
        
        // Check for suspicious co-member patterns
        uint256 newAccountCount = 0;
        for (uint256 i = 0; i < otherMembers.length; i++) {
            if (isNewAccount(otherMembers[i])) {
                newAccountCount++;
            }
        }
        
        if (newAccountCount > otherMembers.length / 2) {
            // Flag but allow (with warning)
            behavior.flagCount++;
            emit SuspiciousActivity(user, "Circle with >50% new accounts");
        }
        
        // Check for wallet clustering
        if (detectWalletClustering(user, otherMembers)) {
            return (false, "Suspicious wallet clustering detected");
        }
        
        return (true, "");
    }
    
    function detectWalletClustering(
        address user,
        address[] calldata members
    ) internal view returns (bool) {
        // Check if wallets share common funding source
        // This is simplified - real implementation would use graph analysis
        
        uint256 sharedHistory = 0;
        for (uint256 i = 0; i < members.length; i++) {
            if (hasSharedFundingSource(user, members[i])) {
                sharedHistory++;
            }
        }
        
        // Flag if >30% of members share funding source
        return sharedHistory > (members.length * 30) / 100;
    }
}
```

### 8.4 Sybil Attack Scenarios & Mitigations

| Attack Scenario | Mitigation |
|-----------------|------------|
| Create 100 wallets, join own circles | Each wallet needs identity verification (costly) + escrow (capital locked) |
| Buy verified identities | Identity providers have fraud detection; cost makes attack unprofitable |
| Circular vouch network | Vouch limit per user; clustering detection; penalty if discovered |
| Minimal circles for score farming | Minimum contribution makes this expensive; limited score gains from small circles |
| Organizer creates fake circles | Organizer reputation at stake; pattern detection for suspicious circles |

---

## 9. Privacy Considerations

### 9.1 Data Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA PRIVACY MODEL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ON-CHAIN (Public)                    OFF-CHAIN (Private)                 │
│   ─────────────────                    ────────────────────                 │
│                                                                             │
│   • Wallet address                     • Real identity (KYC)               │
│   • Credit score (integer)             • Email, phone                       │
│   • Circle participation (IDs)         • Bank connections                   │
│   • Payment events (amounts)           • IP addresses                       │
│   • Attestations (hashes)              • Device fingerprints                │
│   • Verification type (enum)           • Raw identity documents             │
│   • Blacklist status                   • Detailed transaction history       │
│                                                                             │
│   ────────────────────────────────────────────────────────────────────     │
│                                                                             │
│   DESIGN PRINCIPLES:                                                        │
│                                                                             │
│   1. Minimal on-chain data: Only what's necessary for protocol function   │
│   2. Pseudonymous by default: Wallet ≠ identity without user action       │
│   3. User-controlled disclosure: User decides what to link                 │
│   4. Zero-knowledge where possible: Prove statements without revealing     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Privacy Features

**Score Queries:**
- Anyone can query a wallet's score (public by design)
- Detailed payment history requires owner signature
- Attestation content is hashed, not stored in clear

**Identity:**
- Worldcoin: Only nullifier hash stored (not iris data)
- Gitcoin: Only score threshold verified (not individual stamps)
- KYC: Hash of verification, not actual documents

**Circle Data:**
- Membership is public (necessary for protocol)
- Individual payment amounts visible (necessary for accountability)
- User can create new wallet to "reset" (at cost of losing score)

### 9.3 GDPR Considerations

| Right | Implementation |
|-------|----------------|
| Right to access | Query own data via contract calls |
| Right to erasure | On-chain data immutable; off-chain data deletable |
| Right to portability | Score is public, exportable |
| Data minimization | Only protocol-essential data on-chain |

---

## 10. Smart Contract Implementation

### 10.1 CreditScore.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract CreditScore is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    uint256 public constant MIN_SCORE = 300;
    uint256 public constant MAX_SCORE = 850;
    uint256 public constant DEFAULT_SCORE = 500;
    
    struct ScoreRecord {
        uint256 score;
        uint256 lastUpdated;
        uint256 firstActivity;
        int256 pendingAdjustment;
    }
    
    struct ScoreEvent {
        int256 delta;
        uint256 timestamp;
        string reason;
        bytes32 sourceId;  // Circle ID or attestation ID
    }
    
    mapping(address => ScoreRecord) public scores;
    mapping(address => ScoreEvent[]) public scoreHistory;
    
    event ScoreUpdated(
        address indexed member,
        int256 delta,
        uint256 newScore,
        string reason
    );
    
    function initialize() public initializer {
        __AccessControl_init();
        __Pausable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    function getScore(address member) external view returns (uint256) {
        ScoreRecord storage record = scores[member];
        
        if (record.lastUpdated == 0) {
            return DEFAULT_SCORE;
        }
        
        // Apply decay and mean reversion
        uint256 decayedScore = _applyDecay(record);
        
        return decayedScore;
    }
    
    function adjustScore(
        address member,
        int256 delta,
        string calldata reason
    ) external onlyRole(UPDATER_ROLE) whenNotPaused {
        _adjustScore(member, delta, reason, bytes32(0));
    }
    
    function adjustScoreWithSource(
        address member,
        int256 delta,
        string calldata reason,
        bytes32 sourceId
    ) external onlyRole(UPDATER_ROLE) whenNotPaused {
        _adjustScore(member, delta, reason, sourceId);
    }
    
    function _adjustScore(
        address member,
        int256 delta,
        string calldata reason,
        bytes32 sourceId
    ) internal {
        ScoreRecord storage record = scores[member];
        
        // Initialize if first activity
        if (record.lastUpdated == 0) {
            record.score = DEFAULT_SCORE;
            record.firstActivity = block.timestamp;
        }
        
        // Calculate new score with bounds
        int256 newScoreInt = int256(record.score) + delta;
        
        if (newScoreInt < int256(MIN_SCORE)) {
            newScoreInt = int256(MIN_SCORE);
        } else if (newScoreInt > int256(MAX_SCORE)) {
            newScoreInt = int256(MAX_SCORE);
        }
        
        record.score = uint256(newScoreInt);
        record.lastUpdated = block.timestamp;
        
        // Record event
        scoreHistory[member].push(ScoreEvent({
            delta: delta,
            timestamp: block.timestamp,
            reason: reason,
            sourceId: sourceId
        }));
        
        emit ScoreUpdated(member, delta, record.score, reason);
    }
    
    function _applyDecay(ScoreRecord storage record) internal view returns (uint256) {
        uint256 score = record.score;
        uint256 timeSinceUpdate = block.timestamp - record.lastUpdated;
        
        // Inactivity multiplier
        uint256 inactivityMultiplier;
        if (timeSinceUpdate <= 30 days) {
            inactivityMultiplier = 100;
        } else if (timeSinceUpdate <= 90 days) {
            inactivityMultiplier = 95;
        } else if (timeSinceUpdate <= 180 days) {
            inactivityMultiplier = 85;
        } else {
            inactivityMultiplier = 75;
        }
        
        score = (score * inactivityMultiplier) / 100;
        
        // Mean reversion (drift toward 500)
        if (timeSinceUpdate > 30 days) {
            uint256 monthsInactive = timeSinceUpdate / 30 days;
            int256 distanceFromNeutral = int256(score) - 500;
            int256 drift = (distanceFromNeutral * int256(monthsInactive) * 5) / 1000;
            
            if (distanceFromNeutral > 0 && drift > 0) {
                score = score > uint256(drift) ? score - uint256(drift) : 500;
            } else if (distanceFromNeutral < 0 && drift < 0) {
                score = score + uint256(-drift) < 500 ? score + uint256(-drift) : 500;
            }
        }
        
        // Ensure bounds
        if (score < MIN_SCORE) score = MIN_SCORE;
        if (score > MAX_SCORE) score = MAX_SCORE;
        
        return score;
    }
    
    function getScoreHistory(
        address member,
        uint256 fromIndex,
        uint256 count
    ) external view returns (ScoreEvent[] memory) {
        ScoreEvent[] storage history = scoreHistory[member];
        
        if (fromIndex >= history.length) {
            return new ScoreEvent[](0);
        }
        
        uint256 endIndex = fromIndex + count;
        if (endIndex > history.length) {
            endIndex = history.length;
        }
        
        ScoreEvent[] memory result = new ScoreEvent[](endIndex - fromIndex);
        for (uint256 i = fromIndex; i < endIndex; i++) {
            result[i - fromIndex] = history[i];
        }
        
        return result;
    }
    
    function getScoreTier(address member) external view returns (string memory) {
        uint256 score = this.getScore(member);
        
        if (score >= 800) return "ELITE";
        if (score >= 700) return "EXCELLENT";
        if (score >= 600) return "GOOD";
        if (score >= 500) return "NEUTRAL";
        if (score >= 400) return "FAIR";
        return "POOR";
    }
    
    function calculateComponentScores(
        address member
    ) external view returns (
        uint256 paymentHistory,
        uint256 circleCompletion,
        uint256 accountAge,
        uint256 volumeDiversity,
        uint256 networkTrust
    ) {
        // This would call internal functions for each component
        // Simplified for documentation
        return (0, 0, 0, 0, 0);
    }
}
```

### 10.2 Testing Specification

```solidity
// Test coverage targets for CreditScore.sol

contract CreditScoreTest is Test {
    
    CreditScore creditScore;
    
    function setUp() public {
        creditScore = new CreditScore();
        creditScore.initialize();
    }
    
    // Score Initialization Tests
    function test_DefaultScoreIs500() public { }
    function test_NewUserGetsDefaultScore() public { }
    function test_InitializeSetsFirstActivity() public { }
    
    // Score Adjustment Tests
    function test_PositiveAdjustmentIncreasesScore() public { }
    function test_NegativeAdjustmentDecreasesScore() public { }
    function test_ScoreCannotExceedMax() public { }
    function test_ScoreCannotGoBelowMin() public { }
    function test_OnlyUpdaterRoleCanAdjust() public { }
    
    // Decay Tests
    function test_NoDecayWithin30Days() public { }
    function test_DecayAt95PercentAfter30Days() public { }
    function test_DecayAt85PercentAfter90Days() public { }
    function test_DecayAt75PercentAfter180Days() public { }
    function test_MeanReversionToward500() public { }
    
    // History Tests
    function test_AdjustmentRecordedInHistory() public { }
    function test_HistoryPagination() public { }
    
    // Access Control Tests
    function test_AdminCanGrantUpdaterRole() public { }
    function test_NonAdminCannotGrantRoles() public { }
    function test_PauseStopsAdjustments() public { }
    
    // Integration Tests
    function test_FullScoreLifecycle() public { }
    function test_RecoveryFromLowScore() public { }
}
```

---

## Appendix A: Score Scenarios

### Scenario 1: New User Journey

```
Day 0:     Join first circle, score = 500 (starting)
Day 30:    First on-time payment, score = 510
Day 60:    Second on-time payment, score = 520
Day 90:    Third on-time payment, score = 530
Day 120:   Fourth on-time payment, score = 540
Day 150:   Fifth on-time payment + streak bonus, score = 565
Day 180:   Circle completes + completion bonus, score = 590
Day 210:   Join second circle, score = 590
...
Year 1:    After 4 circles, score ~700 (Excellent tier)
```

### Scenario 2: Default and Recovery

```
Month 0:   Score = 650 (Good tier)
Month 1:   Hard default occurs, score = 600 (-50)
           90-day blacklist starts
Month 4:   Blacklist expires, score = 585 (decay)
           Joins limited circle ($100 max)
Month 5:   On-time payment, score = 595
Month 6:   On-time payment, score = 605
Month 7:   Circle completes, score = 630
Month 12:  After rehabilitation, score = 680
           Good standing restored
```

### Scenario 3: Sybil Attack Attempt

```
Attacker creates 10 wallets:
- Each needs identity verification: $10+ per verification
- Each needs $400 escrow for $100 circle: $4,000 total capital
- Best case: +60 points per wallet (6 circles × 10 points)
- Total cost: $100+ in verification + $4,000 locked capital
- Result: Economically unviable for score farming
```

---

**Document Version:** 1.0.0  
**Author:** XXIX Labs  
**Review Status:** Draft

