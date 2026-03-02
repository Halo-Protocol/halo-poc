# Halo Protocol — Mechanism Specification

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Status:** Draft for Review

---

## Table of Contents

1. [Overview](#1-overview)
2. [Circle (ROSCA) Mechanism](#2-circle-rosca-mechanism)
3. [Escrow & Collateral System](#3-escrow--collateral-system)
4. [Default Workflow](#4-default-workflow)
5. [On-Chain Penalties](#5-on-chain-penalties)
6. [Liquidation Mechanism](#6-liquidation-mechanism)
7. [Reserve & Insurance Design](#7-reserve--insurance-design)
8. [Lending Mechanism (Phase 3)](#8-lending-mechanism-phase-3)
9. [Fee Structure](#9-fee-structure)
10. [Smart Contract Architecture](#10-smart-contract-architecture)

---

## 1. Overview

Halo Protocol implements a phased approach to on-chain credit infrastructure:

| Phase | Description | Risk Level | Grant Scope |
|-------|-------------|------------|-------------|
| Phase 1 | Fully collateralized ROSCA circles | Zero credit risk | ✅ Included |
| Phase 2 | Reputation scoring from payment behavior | Zero credit risk | ✅ Included |
| Phase 3 | Score-based under-collateralized lending | Managed credit risk | ❌ Post-grant |

This specification covers the complete mechanism design for all phases, with Phases 1-2 implemented during the grant period.

---

## 2. Circle (ROSCA) Mechanism

### 2.1 What is a Circle?

A Circle is a Rotating Savings and Credit Association (ROSCA) — a traditional savings mechanism used by billions globally, now implemented on-chain with cryptographic guarantees.

**Example Flow:**
```
5 Members | $100/month contribution | 5 months

Month 1: All contribute $100 → Member A receives $500 pot
Month 2: All contribute $100 → Member B receives $500 pot
Month 3: All contribute $100 → Member C receives $500 pot
Month 4: All contribute $100 → Member D receives $500 pot
Month 5: All contribute $100 → Member E receives $500 pot

Result: Each member saves $500 total, receives $500 lump sum once
```

### 2.2 Circle Parameters

| Parameter | Constraint | Validation | Rationale |
|-----------|------------|------------|-----------|
| `memberCount` | 3-10 | `require(n >= 3 && n <= 10)` | Manageable group dynamics |
| `contributionAmount` | 10-10,000 USDC | `require(amt >= 10e6 && amt <= 10000e6)` | Micro to moderate savings |
| `cycleDuration` | 7-30 days | `require(dur >= 7 days && dur <= 30 days)` | Weekly to monthly cycles |
| `gracePeriod` | 48 hours | Configurable by organizer (24-72h) | Time for late payments |
| `payoutOrder` | Predetermined / Auction | Enum: FIXED, AUCTION, RANDOM | Fair distribution method |
| `token` | USDC (default) | Whitelist: USDC, USDT, DAI | Stable value preservation |

### 2.3 Circle State Machine

```
                    ┌─────────────────────────────────────────────────┐
                    │                                                 │
                    ▼                                                 │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────────┐          │
│ PENDING │───▶│ FUNDING │───▶│ ACTIVE  │───▶│ COMPLETED │          │
└────┬────┘    └────┬────┘    └────┬────┘    └───────────┘          │
     │              │              │                                 │
     │              │              │         ┌───────────┐          │
     │              └──────────────┼────────▶│ CANCELLED │──────────┘
     │                             │         └───────────┘   (refund)
     │                             │
     │                             │         ┌───────────┐
     └─────────────────────────────┴────────▶│ DEFAULTED │
                                             └───────────┘
```

**State Transitions:**

| From | To | Trigger | Action |
|------|----|---------||--------|
| PENDING | FUNDING | Minimum members join | Open escrow deposits |
| FUNDING | ACTIVE | All escrow deposited within deadline | Lock escrow, start Round 1 |
| FUNDING | CANCELLED | Funding deadline expires | Refund all deposits |
| ACTIVE | COMPLETED | All rounds paid out | Release escrow, update scores |
| ACTIVE | DEFAULTED | Unrecoverable default (no escrow) | Distribute remaining, blacklist |
| ACTIVE | CANCELLED | Organizer cancels (before first payout) | Refund pro-rata |

### 2.4 Round Lifecycle

Each Circle consists of `memberCount` rounds:

```
Round N Lifecycle:
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  DAY 0          DAY 1-X        DAY X          DAY X+2           │
│  ─────          ───────        ─────          ──────            │
│                                                                  │
│  Round          Contribution   Contribution   Payout            │
│  Opens          Window         Due            Executed          │
│    │               │              │              │               │
│    ▼               ▼              ▼              ▼               │
│  ┌────┐        ┌────────┐    ┌────────┐    ┌────────┐          │
│  │Open│───────▶│Collect │───▶│Grace   │───▶│Execute │          │
│  │    │        │        │    │Period  │    │Payout  │          │
│  └────┘        └────────┘    └────────┘    └────────┘          │
│                                                                  │
│  Events:       ContributionReceived    GracePeriodExpired       │
│  Emitted       ContributionMissed      DefaultRecorded          │
│                                         PayoutExecuted           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.5 Payout Order Methods

**FIXED (Default):** Order determined at circle creation, transparent to all members.

**AUCTION:** Members bid interest premium to receive earlier payouts.
```
Auction Rules:
- Minimum bid: 0%
- Maximum bid: 10%
- Bid submitted before round starts
- Highest bidder receives payout
- Premium distributed to remaining members
```

**RANDOM:** Verifiable random selection using Chainlink VRF or commit-reveal.

---

## 3. Escrow & Collateral System

### 3.1 Phase 1: Full Collateralization

Every member must deposit escrow covering their maximum potential liability:

```solidity
// Escrow requirement per member
escrowRequired = contributionAmount × (memberCount - 1)

// This covers ALL remaining contributions if member stops paying
```

**Worked Example:**
```
Circle: 5 members, $100/month contribution, 5 months

Member A joins:
- Contribution per round: $100
- Rounds after first payout: 4 (Member A receives payout in Round 1)
- Escrow required: $100 × 4 = $400

If Member A defaults after receiving $500 payout:
- Escrow covers remaining $400 in contributions
- Other members unaffected
- Circle completes successfully
```

### 3.2 Escrow Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract HaloEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct EscrowRecord {
        uint256 deposited;      // Total deposited
        uint256 locked;         // Currently locked for circle
        uint256 available;      // Available for withdrawal
        uint256 lastUpdate;     // Last modification timestamp
    }
    
    mapping(address => mapping(uint256 => EscrowRecord)) public escrows;
    // escrows[member][circleId] => EscrowRecord
    
    IERC20 public immutable token;
    address public circleFactory;
    
    event EscrowDeposited(address indexed member, uint256 indexed circleId, uint256 amount);
    event EscrowLocked(address indexed member, uint256 indexed circleId, uint256 amount);
    event EscrowDeducted(address indexed member, uint256 indexed circleId, uint256 amount, string reason);
    event EscrowReleased(address indexed member, uint256 indexed circleId, uint256 amount);
    event EscrowWithdrawn(address indexed member, uint256 indexed circleId, uint256 amount);
    
    modifier onlyCircle(uint256 circleId) {
        require(msg.sender == ICircleFactory(circleFactory).getCircle(circleId), "Not circle contract");
        _;
    }
    
    function deposit(uint256 circleId, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        EscrowRecord storage record = escrows[msg.sender][circleId];
        record.deposited += amount;
        record.available += amount;
        record.lastUpdate = block.timestamp;
        
        emit EscrowDeposited(msg.sender, circleId, amount);
    }
    
    function lock(address member, uint256 circleId, uint256 amount) 
        external 
        onlyCircle(circleId) 
    {
        EscrowRecord storage record = escrows[member][circleId];
        require(record.available >= amount, "Insufficient escrow");
        
        record.available -= amount;
        record.locked += amount;
        record.lastUpdate = block.timestamp;
        
        emit EscrowLocked(member, circleId, amount);
    }
    
    function deduct(
        address member, 
        uint256 circleId, 
        uint256 amount,
        string calldata reason
    ) external onlyCircle(circleId) returns (uint256 deducted) {
        EscrowRecord storage record = escrows[member][circleId];
        
        // Deduct from locked first, then available
        if (record.locked >= amount) {
            record.locked -= amount;
            deducted = amount;
        } else {
            deducted = record.locked;
            uint256 remaining = amount - record.locked;
            record.locked = 0;
            
            if (record.available >= remaining) {
                record.available -= remaining;
                deducted += remaining;
            } else {
                deducted += record.available;
                record.available = 0;
            }
        }
        
        record.lastUpdate = block.timestamp;
        emit EscrowDeducted(member, circleId, deducted, reason);
        
        return deducted;
    }
    
    function release(address member, uint256 circleId) 
        external 
        onlyCircle(circleId) 
    {
        EscrowRecord storage record = escrows[member][circleId];
        uint256 amount = record.locked;
        
        record.locked = 0;
        record.available += amount;
        record.lastUpdate = block.timestamp;
        
        emit EscrowReleased(member, circleId, amount);
    }
    
    function withdraw(uint256 circleId, uint256 amount) external nonReentrant {
        EscrowRecord storage record = escrows[msg.sender][circleId];
        require(record.available >= amount, "Insufficient available escrow");
        
        record.available -= amount;
        record.lastUpdate = block.timestamp;
        
        token.safeTransfer(msg.sender, amount);
        
        emit EscrowWithdrawn(msg.sender, circleId, amount);
    }
    
    function getEscrowBalance(address member, uint256 circleId) 
        external 
        view 
        returns (uint256 total, uint256 locked, uint256 available) 
    {
        EscrowRecord storage record = escrows[member][circleId];
        return (record.deposited, record.locked, record.available);
    }
}
```

### 3.3 Escrow Yield Generation

Idle escrow can generate yield via Aave V3 integration:

```solidity
// Simplified yield adapter
contract AaveYieldAdapter {
    IPool public immutable aavePool;
    IERC20 public immutable usdc;
    IERC20 public immutable aUsdc;
    
    function depositToAave(uint256 amount) external {
        usdc.approve(address(aavePool), amount);
        aavePool.supply(address(usdc), amount, address(this), 0);
    }
    
    function withdrawFromAave(uint256 amount) external returns (uint256) {
        return aavePool.withdraw(address(usdc), amount, msg.sender);
    }
    
    function getYieldAccrued() external view returns (uint256) {
        return aUsdc.balanceOf(address(this)) - totalDeposited;
    }
}
```

**Yield Distribution:**
- 90% to circle members (proportional to escrow)
- 10% to protocol reserve

---

## 4. Default Workflow

### 4.1 Default Types

| Type | Trigger | Escrow State | Recovery |
|------|---------|--------------|----------|
| **Grace Period** | Contribution not paid by due date | Intact | Full recovery possible |
| **Soft Default** | Grace period expires, escrow covers | Deducted | Circle continues |
| **Hard Default** | Escrow insufficient to cover | Depleted | Member removed |
| **Cascade Default** | Multiple hard defaults | Distributed | Circle terminates |

### 4.2 Detection & Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEFAULT DETECTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   CONTRIBUTION DUE DATE                                                     │
│         │                                                                   │
│         ▼                                                                   │
│   ┌───────────────────┐     YES     ┌─────────────────────┐               │
│   │ Payment Received? │ ──────────▶ │ NORMAL FLOW         │               │
│   └───────┬───────────┘             │ • Record payment    │               │
│           │ NO                       │ • +10 score points  │               │
│           ▼                          │ • Emit PaymentMade  │               │
│   ┌───────────────────┐             └─────────────────────┘               │
│   │ GRACE PERIOD      │                                                    │
│   │ (48 hours)        │ ◀── Push notification sent                        │
│   │ • Status: PENDING │     Email reminder sent                            │
│   │ • No penalty yet  │     On-chain: GracePeriodStarted                  │
│   └───────┬───────────┘                                                    │
│           │                                                                 │
│           ▼ Grace period expires                                            │
│   ┌───────────────────┐     YES     ┌─────────────────────┐               │
│   │ Late Payment?     │ ──────────▶ │ LATE BUT PAID       │               │
│   └───────┬───────────┘             │ • +5 score points   │               │
│           │ NO                       │ • Warning flag      │               │
│           ▼                          │ • Circle continues  │               │
│   ┌───────────────────┐             └─────────────────────┘               │
│   │ SOFT DEFAULT      │                                                    │
│   │ • Deduct escrow   │ ◀── contribution amount from escrow               │
│   │ • -20 score pts   │                                                    │
│   │ • Strike recorded │                                                    │
│   │ • Emit SoftDefault│                                                    │
│   └───────┬───────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│   ┌───────────────────┐     YES     ┌─────────────────────┐               │
│   │ Remaining escrow  │ ──────────▶ │ CIRCLE CONTINUES    │               │
│   │ sufficient for    │             │ • Member flagged    │               │
│   │ remaining rounds? │             │ • Watch status      │               │
│   └───────┬───────────┘             └─────────────────────┘               │
│           │ NO                                                              │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ HARD DEFAULT      │                                                    │
│   │ • Member removed  │                                                    │
│   │ • -50 score pts   │                                                    │
│   │ • 90-day blacklist│                                                    │
│   │ • Escrow to pool  │                                                    │
│   │ • Emit HardDefault│                                                    │
│   └───────┬───────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│   ┌───────────────────┐     YES     ┌─────────────────────┐               │
│   │ Pool still        │ ──────────▶ │ CIRCLE ADJUSTS      │               │
│   │ sufficient?       │             │ • Reduce rounds     │               │
│   │                   │             │ • Redistribute      │               │
│   └───────┬───────────┘             └─────────────────────┘               │
│           │ NO                                                              │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ CASCADE DEFAULT   │                                                    │
│   │ • Circle DEFAULTED│                                                    │
│   │ • Distribute pro- │                                                    │
│   │   rata to victims │                                                    │
│   │ • All defaulters  │                                                    │
│   │   blacklisted     │                                                    │
│   └───────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Default Detection Smart Contract

```solidity
function processRoundEnd(uint256 circleId, uint256 roundId) external {
    Circle storage circle = circles[circleId];
    Round storage round = circle.rounds[roundId];
    
    require(block.timestamp > round.dueDate + circle.gracePeriod, "Grace period active");
    require(!round.processed, "Round already processed");
    
    uint256 totalCollected = 0;
    
    for (uint256 i = 0; i < circle.members.length; i++) {
        address member = circle.members[i];
        Payment storage payment = round.payments[member];
        
        if (payment.status == PaymentStatus.PAID) {
            totalCollected += payment.amount;
        } else if (payment.status == PaymentStatus.PENDING) {
            // Attempt escrow deduction
            uint256 deducted = escrow.deduct(
                member, 
                circleId, 
                circle.contributionAmount,
                "Soft default - contribution missed"
            );
            
            if (deducted == circle.contributionAmount) {
                // Soft default - escrow covered
                payment.status = PaymentStatus.ESCROW_DEDUCTED;
                totalCollected += deducted;
                
                _recordDefault(member, circleId, DefaultType.SOFT);
                emit SoftDefault(member, circleId, roundId, deducted);
            } else {
                // Hard default - insufficient escrow
                payment.status = PaymentStatus.DEFAULTED;
                totalCollected += deducted;
                
                _recordDefault(member, circleId, DefaultType.HARD);
                _removeMember(circleId, member);
                emit HardDefault(member, circleId, roundId, deducted);
            }
        }
    }
    
    // Execute payout
    if (totalCollected > 0) {
        address recipient = round.recipient;
        token.safeTransfer(recipient, totalCollected);
        
        round.amountPaid = totalCollected;
        round.processed = true;
        
        emit PayoutExecuted(circleId, roundId, recipient, totalCollected);
    }
    
    // Check if circle should continue
    if (circle.activeMembers.length < circle.minMembers) {
        _terminateCircle(circleId, TerminationReason.INSUFFICIENT_MEMBERS);
    }
}

function _recordDefault(address member, uint256 circleId, DefaultType defaultType) internal {
    MemberRecord storage record = memberRecords[member];
    
    if (defaultType == DefaultType.SOFT) {
        record.softDefaults += 1;
        creditScore.adjustScore(member, -20, "Soft default");
        
        if (record.softDefaults >= 3) {
            record.strikes += 1;
        }
    } else if (defaultType == DefaultType.HARD) {
        record.hardDefaults += 1;
        record.strikes += 1;
        creditScore.adjustScore(member, -50, "Hard default");
        
        // Blacklist
        record.blacklistedUntil = block.timestamp + 90 days;
        emit MemberBlacklisted(member, record.blacklistedUntil);
    }
    
    // Check strike threshold
    if (record.strikes >= 3) {
        record.blacklistedUntil = block.timestamp + 180 days;
        creditScore.adjustScore(member, -100, "Strike threshold exceeded");
        emit MemberBlacklisted(member, record.blacklistedUntil);
    }
    
    record.lastDefaultTimestamp = block.timestamp;
    emit DefaultRecorded(member, circleId, defaultType, block.timestamp);
}
```

---

## 5. On-Chain Penalties

### 5.1 Penalty Matrix

| Event | Score Impact | Escrow Impact | Additional Penalty |
|-------|--------------|---------------|-------------------|
| **Positive Events** | | | |
| On-time payment | +10 | None | None |
| Early payment (>24h before due) | +12 | None | Priority badge |
| Circle completion (as participant) | +25 | Released | Tier unlock |
| Circle completion (as organizer) | +35 | Released | Organizer badge |
| Perfect attendance (all payments on-time) | +50 bonus | Full release | Perfect score badge |
| Payment streak (5 consecutive) | +15 bonus | None | Streak badge |
| Payment streak (10 consecutive) | +30 bonus | None | Elite badge |
| **Negative Events** | | | |
| Late payment (within grace) | +5 | None | Warning flag |
| Soft default (escrow covers) | -20 | Deducted | 1 strike |
| Hard default (escrow depleted) | -50 | Fully deducted | 90-day blacklist |
| Abandoned circle (before completion) | -30 | Forfeited | 60-day blacklist |
| 3 strikes in 12 months | -100 | N/A | 180-day blacklist |
| Fraud report (verified) | -200 | Seized | Permanent blacklist |

### 5.2 Penalty Enforcement Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PenaltyEngine {
    
    // Penalty configuration
    struct PenaltyConfig {
        int16 scoreImpact;
        uint32 blacklistDuration;  // seconds
        bool requiresEscrowDeduction;
        string description;
    }
    
    mapping(bytes32 => PenaltyConfig) public penalties;
    
    // Penalty type hashes
    bytes32 public constant SOFT_DEFAULT = keccak256("SOFT_DEFAULT");
    bytes32 public constant HARD_DEFAULT = keccak256("HARD_DEFAULT");
    bytes32 public constant ABANDONED = keccak256("ABANDONED");
    bytes32 public constant STRIKE_THRESHOLD = keccak256("STRIKE_THRESHOLD");
    bytes32 public constant FRAUD = keccak256("FRAUD");
    
    constructor() {
        penalties[SOFT_DEFAULT] = PenaltyConfig({
            scoreImpact: -20,
            blacklistDuration: 0,
            requiresEscrowDeduction: true,
            description: "Soft default - escrow covered contribution"
        });
        
        penalties[HARD_DEFAULT] = PenaltyConfig({
            scoreImpact: -50,
            blacklistDuration: 90 days,
            requiresEscrowDeduction: true,
            description: "Hard default - insufficient escrow"
        });
        
        penalties[ABANDONED] = PenaltyConfig({
            scoreImpact: -30,
            blacklistDuration: 60 days,
            requiresEscrowDeduction: true,
            description: "Abandoned circle before completion"
        });
        
        penalties[STRIKE_THRESHOLD] = PenaltyConfig({
            scoreImpact: -100,
            blacklistDuration: 180 days,
            requiresEscrowDeduction: false,
            description: "Three strikes in 12 months"
        });
        
        penalties[FRAUD] = PenaltyConfig({
            scoreImpact: -200,
            blacklistDuration: type(uint32).max, // Permanent
            requiresEscrowDeduction: true,
            description: "Verified fraudulent behavior"
        });
    }
    
    function applyPenalty(
        address member,
        bytes32 penaltyType,
        uint256 circleId
    ) external onlyAuthorized returns (bool) {
        PenaltyConfig memory config = penalties[penaltyType];
        require(config.scoreImpact != 0, "Invalid penalty type");
        
        // Apply score impact
        creditScore.adjustScore(member, config.scoreImpact, config.description);
        
        // Apply blacklist if applicable
        if (config.blacklistDuration > 0) {
            uint256 until = block.timestamp + config.blacklistDuration;
            memberRecords[member].blacklistedUntil = until;
            emit MemberBlacklisted(member, until, penaltyType);
        }
        
        // Deduct escrow if required
        if (config.requiresEscrowDeduction) {
            // Escrow deduction handled by caller
        }
        
        emit PenaltyApplied(member, penaltyType, config.scoreImpact, circleId);
        
        return true;
    }
    
    function isBlacklisted(address member) external view returns (bool) {
        return memberRecords[member].blacklistedUntil > block.timestamp;
    }
    
    function getBlacklistExpiry(address member) external view returns (uint256) {
        return memberRecords[member].blacklistedUntil;
    }
}
```

### 5.3 Strike System

```
Strike Accumulation:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Strike 1          Strike 2          Strike 3               │
│  ────────          ────────          ────────               │
│                                                              │
│  ┌────────┐        ┌────────┐        ┌────────┐            │
│  │ Warning│  +12mo │ Warning│  +12mo │Blacklist│            │
│  │ Flag   │ ─────▶ │ Flag   │ ─────▶ │180 days│            │
│  │ -20 pts│        │ -20 pts│        │-100 pts│            │
│  └────────┘        └────────┘        └────────┘            │
│                                                              │
│  Strikes decay after 12 months of clean behavior            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Liquidation Mechanism

### 6.1 Liquidation Context

Liquidation applies to **Phase 3 (Lending)** where under-collateralized loans exist. Not applicable to fully escrowed circles.

### 6.2 Health Factor Calculation

```solidity
// Health Factor determines liquidation eligibility
healthFactor = (collateralValue × liquidationThreshold) / debtValue

// Example:
// Collateral: $1,000 USDC (100% LT)
// Debt: $800 borrowed
// Health Factor = (1000 × 1.0) / 800 = 1.25

// Liquidation triggered when Health Factor < 1.0
```

### 6.3 Collateral Ratios by Score

| Halo Score | Collateral Ratio | Liquidation Threshold | Max Loan |
|------------|------------------|----------------------|----------|
| 300-499 | Not eligible | N/A | $0 |
| 500-599 | 150% | 125% | $500 |
| 600-699 | 130% | 110% | $2,000 |
| 700-799 | 110% | 100% | $5,000 |
| 800-850 | 80% | 95% | $10,000 |

### 6.4 Liquidation Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LIQUIDATION WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   HEALTH FACTOR MONITORING                                                  │
│         │                                                                   │
│         ▼                                                                   │
│   ┌───────────────────┐                                                    │
│   │ HF > 1.0?         │────▶ YES ────▶ Position Safe                       │
│   └───────┬───────────┘                                                    │
│           │ NO                                                              │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ HF > 0.95?        │────▶ YES ────▶ Warning Zone                        │
│   │ (Warning Zone)    │               • Notify user                        │
│   └───────┬───────────┘               • 24h to add collateral              │
│           │ NO                                                              │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ LIQUIDATION       │                                                    │
│   │ ELIGIBLE          │                                                    │
│   │ HF < 0.95         │                                                    │
│   └───────┬───────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ LIQUIDATOR        │                                                    │
│   │ AUCTION           │ ◀── Open to any address                            │
│   │ • Close factor:   │     Liquidator repays debt                         │
│   │   50% max         │     Receives collateral + bonus                    │
│   │ • Bonus: 5%       │                                                    │
│   └───────┬───────────┘                                                    │
│           │                                                                 │
│           ▼                                                                 │
│   ┌───────────────────┐                                                    │
│   │ POST-LIQUIDATION  │                                                    │
│   │ • Score penalty   │ ◀── -30 points                                     │
│   │ • Remaining debt  │     User may still owe                             │
│   │   if undercoll.   │     Bad debt to reserve                            │
│   │ • Credit event    │     Recorded on-chain                              │
│   └───────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Liquidation Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract LiquidationEngine {
    
    uint256 public constant CLOSE_FACTOR = 5000;  // 50% max liquidation per tx
    uint256 public constant LIQUIDATION_BONUS = 500;  // 5% bonus
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant WARNING_HF = 0.95e18;  // 0.95
    uint256 public constant LIQUIDATION_HF = 0.95e18;  // Below this = liquidatable
    
    struct Position {
        uint256 collateral;
        uint256 debt;
        uint256 lastUpdate;
        bool isActive;
    }
    
    mapping(address => Position) public positions;
    
    event LiquidationWarning(address indexed user, uint256 healthFactor);
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    
    function getHealthFactor(address user) public view returns (uint256) {
        Position storage pos = positions[user];
        if (pos.debt == 0) return type(uint256).max;
        
        uint256 threshold = _getLiquidationThreshold(user);
        return (pos.collateral * threshold) / pos.debt;
    }
    
    function _getLiquidationThreshold(address user) internal view returns (uint256) {
        uint256 score = creditScore.getScore(user);
        
        if (score >= 800) return 0.95e18;      // 95%
        if (score >= 700) return 1.00e18;      // 100%
        if (score >= 600) return 1.10e18;      // 110%
        if (score >= 500) return 1.25e18;      // 125%
        return type(uint256).max;              // Not eligible
    }
    
    function liquidate(
        address user,
        uint256 repayAmount
    ) external nonReentrant returns (uint256 collateralSeized) {
        Position storage pos = positions[user];
        require(pos.isActive, "No active position");
        
        uint256 hf = getHealthFactor(user);
        require(hf < LIQUIDATION_HF, "Position healthy");
        
        // Limit to close factor
        uint256 maxRepay = (pos.debt * CLOSE_FACTOR) / BASIS_POINTS;
        repayAmount = repayAmount > maxRepay ? maxRepay : repayAmount;
        
        // Calculate collateral to seize (with bonus)
        collateralSeized = (repayAmount * (BASIS_POINTS + LIQUIDATION_BONUS)) / BASIS_POINTS;
        
        // Cap at available collateral
        if (collateralSeized > pos.collateral) {
            collateralSeized = pos.collateral;
            // Bad debt - difference goes to reserve
            uint256 badDebt = repayAmount - (collateralSeized * BASIS_POINTS / (BASIS_POINTS + LIQUIDATION_BONUS));
            reserve.coverBadDebt(badDebt);
        }
        
        // Execute liquidation
        token.safeTransferFrom(msg.sender, address(this), repayAmount);
        token.safeTransfer(msg.sender, collateralSeized);
        
        pos.debt -= repayAmount;
        pos.collateral -= collateralSeized;
        pos.lastUpdate = block.timestamp;
        
        // Apply score penalty
        creditScore.adjustScore(user, -30, "Liquidation event");
        
        emit Liquidated(user, msg.sender, repayAmount, collateralSeized);
        
        // Check if position closed
        if (pos.debt == 0) {
            pos.isActive = false;
        }
        
        return collateralSeized;
    }
}
```

---

## 7. Reserve & Insurance Design

### 7.1 Purpose

The Reserve Fund provides:
1. **Bad debt coverage** for under-collateralized liquidations
2. **Shortfall protection** for circle defaults (edge cases)
3. **Protocol stability** buffer

### 7.2 Phase 1: No Reserve Needed

In fully escrowed circles, 100% of liability is covered by member escrow. No reserve required.

### 7.3 Phase 2+: Reserve Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESERVE FUND ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FUNDING SOURCES                        RESERVE POOL                       │
│   ───────────────                        ────────────                       │
│                                                                             │
│   ┌───────────────────┐                 ┌───────────────────┐              │
│   │ 0.5% of circle    │ ───────────────▶│                   │              │
│   │ payouts           │                 │   RESERVE FUND    │              │
│   └───────────────────┘                 │                   │              │
│                                         │   Target: 5% of   │              │
│   ┌───────────────────┐                 │   Protocol TVL    │              │
│   │ 10% of protocol   │ ───────────────▶│                   │              │
│   │ fees              │                 │   ────────────    │              │
│   └───────────────────┘                 │                   │              │
│                                         │   Current: $X     │              │
│   ┌───────────────────┐                 │   Target: $Y      │              │
│   │ Yield on idle     │ ───────────────▶│   Ratio: X/Y      │              │
│   │ reserves (Aave)   │                 │                   │              │
│   └───────────────────┘                 └─────────┬─────────┘              │
│                                                   │                         │
│   ┌───────────────────┐                           │                         │
│   │ Penalty fees      │ ─────────────────────────▶│                         │
│   │ (late, default)   │                           │                         │
│   └───────────────────┘                           │                         │
│                                                   ▼                         │
│                              ┌──────────────────────────────────────┐      │
│                              │          COVERAGE TRIGGERS           │      │
│                              ├──────────────────────────────────────┤      │
│                              │                                      │      │
│                              │  1. Bad debt from liquidations       │      │
│                              │     - Undercollateralized remainder  │      │
│                              │                                      │      │
│                              │  2. Circle shortfall (rare)          │      │
│                              │     - Technical failure              │      │
│                              │     - Exploit compensation           │      │
│                              │                                      │      │
│                              │  3. Insurance claims                 │      │
│                              │     - Verified fraud losses          │      │
│                              │     - Oracle failure losses          │      │
│                              │                                      │      │
│                              └──────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Reserve Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Target Ratio | 5% of TVL | Industry standard for DeFi reserves |
| Minimum Ratio | 2% of TVL | Auto-pause new lending below this |
| Maximum Claim | 50% of reserve | Prevent single event depletion |
| Claim Approval | 3/5 multisig | Decentralized governance |
| Yield Strategy | Aave V3 | Battle-tested, low risk |

### 7.5 Reserve Smart Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ReserveFund {
    
    uint256 public constant TARGET_RATIO = 500;  // 5% in basis points
    uint256 public constant MINIMUM_RATIO = 200;  // 2%
    uint256 public constant MAX_CLAIM_RATIO = 5000;  // 50% of reserve
    uint256 public constant BASIS_POINTS = 10000;
    
    uint256 public totalReserve;
    uint256 public totalClaimed;
    
    address public governance;
    IYieldAdapter public yieldAdapter;
    
    mapping(bytes32 => Claim) public claims;
    
    struct Claim {
        uint256 amount;
        string reason;
        address beneficiary;
        uint256 approvals;
        bool executed;
        mapping(address => bool) hasApproved;
    }
    
    event ReserveDeposited(uint256 amount, string source);
    event ClaimSubmitted(bytes32 indexed claimId, uint256 amount, string reason);
    event ClaimApproved(bytes32 indexed claimId, address approver);
    event ClaimExecuted(bytes32 indexed claimId, uint256 amount, address beneficiary);
    event EmergencyPause(string reason);
    
    modifier onlyGovernance() {
        require(msg.sender == governance, "Not governance");
        _;
    }
    
    function deposit(uint256 amount, string calldata source) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        totalReserve += amount;
        
        // Deploy to yield
        if (address(yieldAdapter) != address(0)) {
            token.approve(address(yieldAdapter), amount);
            yieldAdapter.deposit(amount);
        }
        
        emit ReserveDeposited(amount, source);
    }
    
    function getReserveRatio() public view returns (uint256) {
        uint256 tvl = _getProtocolTVL();
        if (tvl == 0) return type(uint256).max;
        return (totalReserve * BASIS_POINTS) / tvl;
    }
    
    function isHealthy() public view returns (bool) {
        return getReserveRatio() >= MINIMUM_RATIO;
    }
    
    function submitClaim(
        uint256 amount,
        string calldata reason,
        address beneficiary
    ) external onlyGovernance returns (bytes32 claimId) {
        require(amount <= (totalReserve * MAX_CLAIM_RATIO) / BASIS_POINTS, "Exceeds max claim");
        
        claimId = keccak256(abi.encodePacked(amount, reason, beneficiary, block.timestamp));
        
        Claim storage claim = claims[claimId];
        claim.amount = amount;
        claim.reason = reason;
        claim.beneficiary = beneficiary;
        
        emit ClaimSubmitted(claimId, amount, reason);
        
        return claimId;
    }
    
    function approveClaim(bytes32 claimId) external {
        require(isMultisigMember(msg.sender), "Not multisig member");
        
        Claim storage claim = claims[claimId];
        require(!claim.executed, "Already executed");
        require(!claim.hasApproved[msg.sender], "Already approved");
        
        claim.hasApproved[msg.sender] = true;
        claim.approvals += 1;
        
        emit ClaimApproved(claimId, msg.sender);
        
        // Execute if threshold reached (3/5)
        if (claim.approvals >= 3) {
            _executeClaim(claimId);
        }
    }
    
    function _executeClaim(bytes32 claimId) internal {
        Claim storage claim = claims[claimId];
        
        // Withdraw from yield if needed
        if (address(yieldAdapter) != address(0)) {
            yieldAdapter.withdraw(claim.amount);
        }
        
        token.safeTransfer(claim.beneficiary, claim.amount);
        
        totalReserve -= claim.amount;
        totalClaimed += claim.amount;
        claim.executed = true;
        
        emit ClaimExecuted(claimId, claim.amount, claim.beneficiary);
        
        // Check health
        if (!isHealthy()) {
            _pauseNewLending();
            emit EmergencyPause("Reserve below minimum ratio");
        }
    }
    
    function coverBadDebt(uint256 amount) external onlyAuthorized {
        require(amount <= totalReserve, "Insufficient reserve");
        
        // Withdraw from yield
        if (address(yieldAdapter) != address(0)) {
            yieldAdapter.withdraw(amount);
        }
        
        // Transfer to lending pool
        token.safeTransfer(lendingPool, amount);
        
        totalReserve -= amount;
        totalClaimed += amount;
        
        emit ReserveClaimed(amount, "Bad debt coverage");
    }
}
```

### 7.6 Auto-Pause Triggers

| Condition | Action | Recovery |
|-----------|--------|----------|
| Reserve < 2% TVL | Pause new lending | Resume when > 3% |
| > 10 defaults/hour | Pause all new circles | Manual review |
| Single loss > 10% reserve | Pause + alert | Governance vote |
| Oracle failure | Pause price-dependent ops | Oracle recovery |

---

## 8. Lending Mechanism (Phase 3)

> **Note:** Phase 3 is NOT in grant scope. Documented for completeness.

### 8.1 Lending Prerequisites

Before accessing lending, users must:
1. Complete at least 3 circles with no defaults
2. Achieve minimum Halo Score of 500
3. Pass identity verification
4. Have no active blacklist

### 8.2 Loan Parameters

```solidity
struct LoanTerms {
    uint256 principal;          // Borrowed amount
    uint256 collateral;         // Posted collateral
    uint256 interestRate;       // Annual rate (basis points)
    uint256 duration;           // Loan term (seconds)
    uint256 originationFee;     // One-time fee (basis points)
    uint256 minPayment;         // Minimum monthly payment
}
```

### 8.3 Interest Rate Model

Dynamic rates based on utilization:

```solidity
function getInterestRate(uint256 utilization) public view returns (uint256) {
    // Base rate + utilization premium
    // Low utilization: cheaper loans
    // High utilization: expensive loans
    
    if (utilization <= OPTIMAL_UTILIZATION) {
        // Linear scaling 0% -> optimal
        return BASE_RATE + (utilization * SLOPE1) / OPTIMAL_UTILIZATION;
    } else {
        // Steep scaling optimal -> 100%
        uint256 excess = utilization - OPTIMAL_UTILIZATION;
        uint256 maxExcess = 1e18 - OPTIMAL_UTILIZATION;
        return OPTIMAL_RATE + (excess * SLOPE2) / maxExcess;
    }
}

// Example parameters:
// BASE_RATE = 2% APR
// OPTIMAL_UTILIZATION = 80%
// OPTIMAL_RATE = 10% APR
// SLOPE1 = 8% (0-80% utilization)
// SLOPE2 = 90% (80-100% utilization)
```

### 8.4 Loan Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                      LOAN LIFECYCLE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   REQUEST          ACTIVE           REPAYMENT        CLOSURE    │
│   ───────          ──────           ─────────        ───────    │
│                                                                  │
│   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐  │
│   │ Submit  │     │ Monitor │     │ Monthly │     │ Full    │  │
│   │ request │────▶│ health  │────▶│ payments│────▶│ repay   │  │
│   └─────────┘     │ factor  │     └─────────┘     └─────────┘  │
│        │          └────┬────┘                           │       │
│        ▼               │                                ▼       │
│   ┌─────────┐         │ HF < 1.0              ┌─────────┐      │
│   │Collateral│         ▼                      │Collateral│      │
│   │ posted  │    ┌─────────┐                  │ returned│      │
│   └─────────┘    │LIQUIDATE│                  └─────────┘      │
│                  └─────────┘                        │           │
│                                                     ▼           │
│                                              ┌─────────┐       │
│                                              │ Score   │       │
│                                              │ updated │       │
│                                              └─────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Fee Structure

### 9.1 Circle Fees

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Circle creation | Free | N/A |
| Contribution fee | 0% | N/A |
| Payout fee | 1% | Protocol |
| Early withdrawal | 2% | Pool members |

### 9.2 Lending Fees (Phase 3)

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Origination fee | 0.5% | Protocol |
| Interest (variable) | 2-50% APR | Protocol |
| Early repayment | None | N/A |
| Late payment | 2% of payment | Reserve |
| Liquidation bonus | 5% | Liquidator |

### 9.3 Fee Distribution

```
Protocol Revenue Distribution:
┌────────────────────────────────────────┐
│                                        │
│   Total Protocol Revenue               │
│            │                           │
│            ▼                           │
│   ┌────────────────────┐              │
│   │                    │              │
│   │  70% ───▶ Treasury │              │
│   │                    │              │
│   │  20% ───▶ Reserve  │              │
│   │                    │              │
│   │  10% ───▶ Stakers  │ (future)    │
│   │                    │              │
│   └────────────────────┘              │
│                                        │
└────────────────────────────────────────┘
```

---

## 10. Smart Contract Architecture

### 10.1 Contract Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTRACT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         PROXY LAYER                                 │  │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐         │  │
│   │   │ Circle    │ │ Escrow    │ │ Credit    │ │ Lending   │         │  │
│   │   │ Proxy     │ │ Proxy     │ │ Score     │ │ Pool      │         │  │
│   │   │           │ │           │ │ Proxy     │ │ Proxy     │         │  │
│   │   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘         │  │
│   └─────────┼─────────────┼─────────────┼─────────────┼───────────────┘  │
│             │             │             │             │                   │
│   ┌─────────┼─────────────┼─────────────┼─────────────┼───────────────┐  │
│   │         ▼             ▼             ▼             ▼               │  │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │  │
│   │   │ Circle    │ │ Escrow    │ │ Credit    │ │ Lending   │        │  │
│   │   │ Impl      │ │ Impl      │ │ Score     │ │ Pool      │        │  │
│   │   │           │ │           │ │ Impl      │ │ Impl      │        │  │
│   │   └───────────┘ └───────────┘ └───────────┘ └───────────┘        │  │
│   │                     IMPLEMENTATION LAYER                          │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │                         SHARED MODULES                             │  │
│   │                                                                    │  │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │  │
│   │   │ Identity  │ │ Penalty   │ │ Reserve   │ │ Yield     │        │  │
│   │   │ Verifier  │ │ Engine    │ │ Fund      │ │ Adapter   │        │  │
│   │   └───────────┘ └───────────┘ └───────────┘ └───────────┘        │  │
│   │                                                                    │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐  │
│   │                         EXTERNAL INTEGRATIONS                      │  │
│   │                                                                    │  │
│   │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │  │
│   │   │ Aave V3   │ │ Gitcoin   │ │ Worldcoin │ │ Chainlink │        │  │
│   │   │ (Yield)   │ │ Passport  │ │ ID        │ │ (Oracle)  │        │  │
│   │   └───────────┘ └───────────┘ └───────────┘ └───────────┘        │  │
│   │                                                                    │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Contract Responsibilities

| Contract | Responsibility | Lines (Est.) |
|----------|---------------|--------------|
| CircleFactory.sol | Circle deployment, registry | ~200 |
| Circle.sol | Circle logic, round management | ~400 |
| Escrow.sol | Collateral management | ~250 |
| CreditScore.sol | Score calculation, storage | ~300 |
| PenaltyEngine.sol | Penalty application | ~150 |
| ReserveFund.sol | Reserve management | ~200 |
| LendingPool.sol | Lending operations (Phase 3) | ~500 |
| Identity.sol | Verification integration | ~150 |
| **Total** | | **~2,150** |

### 10.3 Upgrade Strategy

All contracts use **Transparent Proxy Pattern** (OpenZeppelin):

```solidity
// ProxyAdmin manages upgrades
contract HaloProxyAdmin is ProxyAdmin {
    uint256 public constant TIMELOCK_DELAY = 7 days;
    
    mapping(address => uint256) public pendingUpgrades;
    
    function scheduleUpgrade(address proxy, address newImpl) external onlyOwner {
        pendingUpgrades[proxy] = block.timestamp + TIMELOCK_DELAY;
        emit UpgradeScheduled(proxy, newImpl, pendingUpgrades[proxy]);
    }
    
    function executeUpgrade(address proxy, address newImpl) external onlyOwner {
        require(block.timestamp >= pendingUpgrades[proxy], "Timelock active");
        _upgrade(proxy, newImpl);
        delete pendingUpgrades[proxy];
    }
}
```

---

## Appendix A: Events Reference

```solidity
// Circle Events
event CircleCreated(uint256 indexed circleId, address indexed organizer, uint256 memberCount);
event MemberJoined(uint256 indexed circleId, address indexed member);
event RoundStarted(uint256 indexed circleId, uint256 indexed roundId);
event ContributionReceived(uint256 indexed circleId, address indexed member, uint256 amount);
event PayoutExecuted(uint256 indexed circleId, address indexed recipient, uint256 amount);
event CircleCompleted(uint256 indexed circleId);

// Default Events
event GracePeriodStarted(uint256 indexed circleId, address indexed member, uint256 deadline);
event SoftDefault(address indexed member, uint256 indexed circleId, uint256 amountDeducted);
event HardDefault(address indexed member, uint256 indexed circleId, uint256 amountDeducted);
event DefaultRecorded(address indexed member, uint256 indexed circleId, DefaultType defaultType);

// Escrow Events
event EscrowDeposited(address indexed member, uint256 indexed circleId, uint256 amount);
event EscrowDeducted(address indexed member, uint256 indexed circleId, uint256 amount);
event EscrowReleased(address indexed member, uint256 indexed circleId, uint256 amount);

// Credit Events
event ScoreUpdated(address indexed member, int256 delta, uint256 newScore, string reason);
event MemberBlacklisted(address indexed member, uint256 until);

// Lending Events (Phase 3)
event LoanOriginated(address indexed borrower, uint256 principal, uint256 collateral);
event LoanRepaid(address indexed borrower, uint256 amount);
event Liquidated(address indexed borrower, address indexed liquidator, uint256 amount);
```

---

## Appendix B: Error Codes

```solidity
error InsufficientEscrow(uint256 required, uint256 available);
error CircleNotActive(uint256 circleId);
error MemberBlacklisted(address member, uint256 until);
error PaymentAlreadyMade(uint256 circleId, uint256 roundId, address member);
error GracePeriodActive(uint256 circleId, uint256 roundId);
error InvalidCollateralRatio(uint256 score, uint256 ratio);
error HealthFactorSafe(uint256 healthFactor);
error ReserveInsufficient(uint256 required, uint256 available);
error TimelockActive(address proxy, uint256 unlockTime);
```

---

**Document Version:** 1.0.0  
**Author:** XXIX Labs  
**Review Status:** Draft

