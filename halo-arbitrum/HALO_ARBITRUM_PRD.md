# Halo Protocol — Product Requirements Document

**Version:** 2.0.0  
**Program:** Arbitrum DAO New Protocols & Ideas 3.0  
**Requested Amount:** $40,000 USD  
**Timeline:** 24 weeks (6 months)  
**Last Updated:** February 2026

---

## Document Index

This PRD consolidates all technical specifications for the Halo Protocol Arbitrum grant application:

| Document | Description | Status |
|----------|-------------|--------|
| **PRD.md** (this file) | Master product requirements | Complete |
| **MECHANISM.md** | Circle lifecycle, escrow, liquidation | Complete |
| **REPUTATION.md** | Credit scoring, attestations, Sybil resistance | Complete |
| **SECURITY.md** | Testing, audits, emergency controls | Complete |
| **INSTRUMENTATION.md** | Subgraph, dashboard, SDK | Complete |

---

## Executive Summary

### What We're Building

Halo Protocol is on-chain credit infrastructure that transforms community lending circles (ROSCAs) into portable, verifiable credit scores on Arbitrum.

### Phased Approach (Risk-Managed)

| Phase | Scope | Credit Risk | Grant Coverage |
|-------|-------|-------------|----------------|
| **Phase 1** | Fully escrowed ROSCA circles | Zero | ✅ Months 1-3 |
| **Phase 2** | Reputation scoring from payments | Zero | ✅ Months 4-6 |
| **Phase 3** | Score-gated under-collateralized lending | Managed | ❌ Post-grant |

**Key Insight:** We prove execution with zero-risk escrowed circles before any credit extension. The grant covers only Phases 1-2.

### Why Arbitrum

1. **Technical Fit:** Low gas for high-frequency micro-transactions (monthly contributions, payouts)
2. **Ecosystem:** Native USDC, Aave integration for future yield strategies
3. **Community:** Large underbanked diaspora user base
4. **Infrastructure:** Robust subgraph support, established DeFi primitives

---

## Part 1: Product Vision

### 1.1 Problem Statement

**2 billion adults globally lack access to traditional credit systems.** They can't get credit cards, mortgages, or business loans — not because they're untrustworthy, but because they have no credit history.

Meanwhile, these same communities have practiced **informal lending circles (ROSCAs)** for centuries:
- Called *chit funds* in India, *tandas* in Latin America, *susus* in Africa
- $1 trillion+ moves through these systems annually
- 99%+ repayment rates in well-run circles

**The Problem:** This trust and repayment behavior is invisible to the financial system.

### 1.2 Solution

Halo Protocol makes this behavior **visible, verifiable, and portable** by:

1. **Digitizing ROSCAs** — Smart contract circles with cryptographic guarantees
2. **Recording Payment History** — Every contribution becomes an on-chain credit event
3. **Generating Credit Scores** — Algorithmic reputation from verified behavior
4. **Enabling Credit Access** — Scores unlock DeFi lending at better terms

### 1.3 User Journey

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        HALO USER JOURNEY                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE 1: JOIN CIRCLE                                                    │
│  ─────────────────────                                                   │
│  • User joins 5-person circle ($100/month)                               │
│  • Deposits $400 escrow (100% collateralized)                            │
│  • Participates in 5 monthly rounds                                      │
│  • Receives $500 payout on their month                                   │
│  • Gets escrow back on completion                                        │
│                                                                          │
│  PHASE 2: BUILD REPUTATION                                               │
│  ─────────────────────────                                               │
│  • Each on-time payment: +10 score points                                │
│  • Circle completion bonus: +25 points                                   │
│  • Starting score: 500 → After 3 circles: ~650                           │
│  • Score visible on-chain, queryable by any protocol                     │
│                                                                          │
│  PHASE 3: ACCESS CREDIT (post-grant)                                     │
│  ────────────────────────────────────                                    │
│  • Score 650+ = 90% collateral lending                                   │
│  • Score 750+ = 80% collateral lending                                   │
│  • Portable to Aave, Compound via adapter                                │
│                                                                          │
│  PHASE 4: HALO CARD (post-grant)                                         │
│  ───────────────────────────────                                         │
│  • Score 650+ = qualify for stablecoin credit card                       │
│  • Credit limit based on Halo Score (up to $10K+)                        │
│  • Spend USDC anywhere Visa/Mastercard accepted                          │
│  • No bank account required — fully crypto-native                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Product Suite

| Product | Status | Description |
|---------|--------|-------------|
| **Halo Circles** | Live (testnet) | Smart contract ROSCAs with 100% escrow |
| **Halo Score** | In development | On-chain credit scoring (300-850) |
| **Halo Lend** | Post-grant | Score-gated under-collateralized lending |
| **Halo Card** | Future | Stablecoin credit card, score = limit |

### 1.5 Success Metrics (Grant Period)

| Metric | M1 (Week 8) | M2 (Week 14) | M3 (Week 20) | M4 (Week 24) |
|--------|-------------|--------------|--------------|--------------|
| Users | 50 testnet | 50 mainnet | 100 | 150+ |
| Circles | 20 test | 15 | 30 | 50+ |
| TVL | — | $10,000 | $25,000 | $50,000+ |
| Default Rate | — | <5% | <3% | <3% |
| Avg Score | — | — | 550+ | 580+ |

---

## Part 2: Mechanism Specification

*Full specification: MECHANISM.md*

### 2.1 Circle (ROSCA) Design

**What is a Circle?**

A Rotating Savings and Credit Association — 3-10 members contribute monthly, one member receives the pot each round, rotating until everyone has received once.

**Example:**
```
5 Members | $100/month | 5 months

Round 1: All pay $100 → Alice gets $500
Round 2: All pay $100 → Bob gets $500
Round 3: All pay $100 → Carol gets $500
Round 4: All pay $100 → Dave gets $500
Round 5: All pay $100 → Eve gets $500

Each member: Saves $500, receives $500 once
```

**Circle Parameters:**

| Parameter | Range | Default |
|-----------|-------|---------|
| Members | 3-10 | 5 |
| Contribution | $10-$10,000 | $100 |
| Cycle Duration | 7-30 days | 30 days |
| Grace Period | 24-72 hours | 48 hours |
| Token | USDC, USDT, DAI | USDC |

### 2.2 Escrow Formula

**Phase 1: 100% Collateralization (Zero Credit Risk)**

```solidity
escrowRequired = contributionAmount × (memberCount - 1)
```

**Example:** 5 members, $100/month
- Each deposits: $100 × 4 = $400 escrow
- Covers all remaining contributions if member stops paying
- Returned in full on circle completion

**Why 100% First:**
- Proves operational execution without risk
- Builds user trust and system confidence
- Generates real payment data for scoring
- De-risks protocol before any credit extension

### 2.3 Circle State Machine

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────────┐
│ PENDING │───▶│ FUNDING │───▶│ ACTIVE  │───▶│ COMPLETED │
└────┬────┘    └────┬────┘    └────┬────┘    └───────────┘
     │              │              │
     │              │              ▼
     │              │         ┌───────────┐
     │              └────────▶│ CANCELLED │
     │                        └───────────┘
     │                             
     └───────────────────────▶┌───────────┐
                              │ DEFAULTED │
                              └───────────┘
```

### 2.4 Default Workflow

```
CONTRIBUTION DUE
      │
      ▼
┌─────────────┐
│Grace Period │◀── 48 hours
└──────┬──────┘
       │
       ▼
  Payment?
   /    \
  YES    NO
  │       │
  ▼       ▼
+10 pts  SOFT DEFAULT
         │ • Deduct from escrow
         │ • -20 score points
         │ • Circle continues
         │
         ▼
    Escrow left?
     /      \
   YES       NO
    │         │
    ▼         ▼
Continue   HARD DEFAULT
           │ • Member removed
           │ • -50 score points
           │ • 90-day blacklist
```

### 2.5 Fee Structure

| Fee Type | Amount | Recipient |
|----------|--------|-----------|
| Circle Payout | 1% | Protocol treasury |
| Origination (Phase 3) | 0.5% | Protocol treasury |
| Lending APR (Phase 3) | 2-50% | Lenders |
| Liquidation Bonus (Phase 3) | 5% | Liquidators |
| Reserve Contribution | 0.5% of payouts | Reserve fund |

---

## Part 3: Reputation Specification

*Full specification: REPUTATION.md*

### 3.1 Halo Score Overview

**FICO-like credit scoring for DeFi:**

| Score Range | Tier | Meaning |
|-------------|------|---------|
| 800-850 | Exceptional | Maximum benefits, lowest collateral |
| 740-799 | Very Good | Preferred rates |
| 670-739 | Good | Standard access |
| 580-669 | Fair | Limited access, higher collateral |
| 300-579 | Poor | Circles only, rebuild path |

**Starting Score:** 500 (Fair tier)  
**Score Range:** 300-850

### 3.2 Score Components

| Component | Weight | What It Measures |
|-----------|--------|------------------|
| Payment History | 40% | On-time contributions, defaults |
| Circle Completion | 25% | Successfully finished circles |
| Account Age | 15% | Time since first activity |
| Volume & Diversity | 10% | Total value, different circles |
| Network Trust | 10% | Vouches, attestations from others |

### 3.3 Payment Scoring

| Event | Points | Rationale |
|-------|--------|-----------|
| On-time payment | +10 | Reliable behavior |
| Early payment (>24h) | +12 | Extra reliability |
| Grace period payment | +5 | Eventual compliance |
| Soft default | -20 | Missed but escrowed |
| Hard default | -50 | Unrecoverable failure |
| Circle completion | +25 | Full commitment |
| 3-month streak | +15 | Sustained reliability |
| 6-month streak | +30 | Long-term reliability |
| 12-month streak | +50 | Exceptional reliability |

### 3.4 Score Decay

**Payment Event Decay:**
| Age | Weight |
|-----|--------|
| 0-6 months | 100% |
| 6-12 months | 80% |
| 12-24 months | 50% |
| 24+ months | 25% |

**Inactivity Decay:**
| Inactive Period | Multiplier |
|-----------------|------------|
| 0-30 days | 100% |
| 30-90 days | 95% |
| 90-180 days | 85% |
| 180+ days | 75% + mean reversion to 500 |

### 3.5 Attestation System

**Attestation Types:**

| Type | Source | Points | Decay |
|------|--------|--------|-------|
| VOUCH | Another user | +3 to +5 | 12 months |
| CIRCLE_COMPLETE | Circle contract | +2 per member | 24 months |
| WARN | Circle organizer | -10 | 18 months |
| FRAUD_REPORT | Investigation | -50 | 36 months |

**Requirements:**
- Voucher must have score 600+ and 1+ completed circles
- Maximum 5 vouches given per 30 days
- Vouches from same circle weighted less (0.3x)

### 3.6 Sybil Resistance (5 Layers)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **L1: Identity** | Worldcoin, Gitcoin Passport, KYC | Prove unique human |
| **L2: Economic** | 100% escrow requirement | Make attacks expensive |
| **L3: Social Graph** | Connection analysis | Detect fake networks |
| **L4: Behavioral** | ML pattern detection | Identify bot activity |
| **L5: Reputation Staking** | Stake score on vouches | Punish false vouches |

---

## Part 4: Security Specification

*Full specification: SECURITY.md*

### 4.1 Test Coverage

| Contract | Target | Critical Paths |
|----------|--------|----------------|
| Escrow.sol | 98% | Deposit, release, forfeit |
| Circle.sol | 98% | Lifecycle, payments, defaults |
| CreditScore.sol | 95% | Calculation, decay, bounds |
| HaloAttestations.sol | 95% | Create, verify, revoke |
| **Overall** | **95%+** | All state transitions |

**Testing Tools:**
- Foundry (primary framework)
- Echidna (fuzzing, 100K+ runs)
- Slither (static analysis)
- Mythril (symbolic execution)

### 4.2 Emergency Controls

**Global Pause:**
- Trigger: 2/3 multisig or automated (>10 defaults/hour)
- Effect: All deposits, withdrawals, payouts halted
- Recovery: Requires 3/5 multisig

**Circuit Breakers (Phase Limits):**

| Phase | TVL Cap | Max Circle | Max Circles/User |
|-------|---------|------------|------------------|
| Phase 1 | $100K | $10K | 3 |
| Phase 2 | $500K | $25K | 5 |
| Phase 3 | $2M | $50K | 10 |

### 4.3 Upgrade Strategy

**Transparent Proxy Pattern:**
- 7-day timelock on upgrades
- 3-day community review period
- Code hash verification required
- Storage gap preservation (50 slots)

### 4.4 Audit Plan

**Budget:** $7K (grant) + $5K (Arbitrum Audit Bank request) = $12-15K

**Timeline:**
```
Week 14: Code freeze
Week 15-17: Competitive audit (Code4rena or Sherlock)
Week 18: Remediation
Week 19: Re-review
Week 20: Mainnet deployment
```

**Bug Bounty (Post-Mainnet):**
- Platform: Immunefi
- Initial Pool: $10K
- Critical: $5-10K | High: $2-5K | Medium: $500-2K | Low: $100-500

### 4.5 Threat Model

| Threat | Mitigation |
|--------|------------|
| Reentrancy | ReentrancyGuard on all external calls |
| Access Control | OpenZeppelin AccessControl + multisig |
| Sybil Attacks | 5-layer resistance system |
| Admin Key Compromise | 3/5 multisig + 7-day timelock |
| Oracle Manipulation | Chainlink price feeds (Phase 3) |
| Flash Loan Attacks | Block-based time checks |

---

## Part 5: Instrumentation Specification

*Full specification: INSTRUMENTATION.md*

### 5.1 Data Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Contracts  │───▶│  The Graph   │───▶│  Dashboard   │
│   (Events)   │    │  (Subgraph)  │    │  (Dune/UI)   │
└──────────────┘    └──────────────┘    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Halo SDK    │
                    │ (@halo/sdk)  │
                    └──────────────┘
```

### 5.2 Subgraph Entities

| Entity | Description |
|--------|-------------|
| Member | User address, score, circles, stats |
| Circle | Parameters, state, members, rounds |
| Round | Contributions, payout recipient |
| Payment | Amount, timing, score impact |
| CreditEvent | Score changes with reasons |
| Attestation | Vouches, warnings, verifications |
| ProtocolMetrics | Global TVL, users, volumes |
| DailyMetrics | Time-series analytics |

### 5.3 Dune Dashboard

**Sections:**
1. **Overview:** TVL, active circles, total users, 24h volume
2. **Circle Activity:** Creation trends, completion rates, size distribution
3. **Payments:** Volume charts, default rates over time
4. **Credit Scores:** Distribution histogram, top scorers
5. **Health Metrics:** Escrow utilization, reserve ratio

### 5.4 SDK (@halo-protocol/sdk)

```typescript
import { HaloSDK } from '@halo-protocol/sdk';

const halo = new HaloSDK({ chainId: 42161 });

// Get credit score
const score = await halo.getCreditScore(address);
// { score: 720, tier: 'Good', history: [...] }

// Get protocol stats
const stats = await halo.getProtocolStats();
// { tvl: 50000, activeCircles: 45, totalUsers: 150 }

// Verify milestone
const milestone = await halo.verifyMilestone('M3');
// { achieved: true, metrics: {...}, blockNumber: 12345678 }
```

### 5.5 Milestone Verification

All milestones verifiable via on-chain queries:

| Milestone | Metrics | Verification |
|-----------|---------|--------------|
| M1 (Week 8) | 50 test users, 20 circles, 90% coverage | Testnet subgraph |
| M2 (Week 14) | 50 mainnet users, $10K TVL, <5% default | Mainnet subgraph |
| M3 (Week 20) | 100 users, $25K TVL, audit complete | Subgraph + audit report |
| M4 (Week 24) | 150 users, $50K TVL, SDK published | Subgraph + npm registry |

---

## Part 6: Technical Implementation

### 6.1 Smart Contract Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     PROXY LAYER (UUPS)                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ CircleProxy  │  │ ScoreProxy   │  │ AttestationProxy     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                 │                      │             │
├─────────┼─────────────────┼──────────────────────┼─────────────┤
│         ▼                 ▼                      ▼             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Circle.sol   │  │CreditScore.sol│ │ HaloAttestations.sol │ │
│  │              │  │              │  │                      │ │
│  │ • lifecycle  │  │ • calculate  │  │ • create             │ │
│  │ • payments   │  │ • decay      │  │ • verify             │ │
│  │ • defaults   │  │ • bounds     │  │ • revoke             │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Escrow.sol   │  │CircleFactory │  │ PenaltyEngine.sol    │ │
│  │              │  │    .sol      │  │                      │ │
│  │ • deposit    │  │ • create     │  │ • calculate          │ │
│  │ • release    │  │ • configure  │  │ • apply              │ │
│  │ • forfeit    │  │ • upgrade    │  │ • blacklist          │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │ ReserveFund  │  │ Liquidation  │  (Phase 3)               │
│  │    .sol      │  │ Engine.sol   │                           │
│  └──────────────┘  └──────────────┘                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Key Interfaces

**ICircle.sol:**
```solidity
interface ICircle {
    function join(uint256 circleId) external;
    function depositEscrow(uint256 circleId) external;
    function contribute(uint256 circleId, uint256 roundId) external;
    function claimPayout(uint256 circleId, uint256 roundId) external;
    function withdraw(uint256 circleId) external;
    
    function getCircleState(uint256 circleId) external view returns (CircleState);
    function getMemberStatus(uint256 circleId, address member) external view returns (MemberStatus);
}
```

**ICreditScore.sol:**
```solidity
interface ICreditScore {
    function getScore(address user) external view returns (uint256);
    function getTier(address user) external view returns (CreditTier);
    function recordPayment(address user, PaymentType ptype, uint256 amount) external;
    function recordDefault(address user, DefaultType dtype) external;
    function getScoreHistory(address user) external view returns (CreditEvent[] memory);
}
```

### 6.3 Deployment Plan

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1-2 | Setup | Repo, CI/CD, Foundry config |
| 3-4 | Core Contracts | Escrow.sol, Circle.sol v1 |
| 5-6 | Circle Lifecycle | Full state machine, payments |
| 7-8 | **M1: Testnet** | Deploy, 50 test users |
| 9-10 | Credit Scoring | CreditScore.sol, decay logic |
| 11-12 | Attestations | HaloAttestations.sol, vouches |
| 13-14 | **M2: Mainnet Beta** | Deploy, 50 users, $10K TVL |
| 15-17 | Security Audit | Code4rena/Sherlock |
| 18-19 | Remediation | Fix findings, re-review |
| 20 | **M3: Full Launch** | 100 users, $25K TVL |
| 21-22 | SDK & Docs | @halo-protocol/sdk, docs site |
| 23-24 | **M4: Completion** | 150 users, $50K TVL, open source |

---

## Part 7: Budget & Milestones

### 7.1 Budget Allocation

| Category | Amount | % |
|----------|--------|---|
| Smart Contract Development | $15,000 | 37.5% |
| Security & Audits | $10,000 | 25.0% |
| Frontend Development | $8,000 | 20.0% |
| Infrastructure & Operations | $4,000 | 10.0% |
| Documentation & Community | $3,000 | 7.5% |
| **Total** | **$40,000** | **100%** |

### 7.2 Milestone Payments

| Milestone | Week | Deliverables | Payment |
|-----------|------|--------------|---------|
| M1 | 8 | Testnet + 50 test users + 90% coverage | $10,000 |
| M2 | 14 | Mainnet beta + 50 users + $10K TVL | $10,000 |
| M3 | 20 | Audit complete + 100 users + $25K TVL | $10,000 |
| M4 | 24 | 150 users + $50K TVL + SDK + open source | $10,000 |

### 7.3 Verification Method

Each milestone verified via:
1. **On-chain queries** to deployed subgraph
2. **Automated verification** in SDK
3. **Public dashboard** on Dune Analytics
4. **GitHub releases** with tagged versions

Example verification query:
```graphql
query VerifyMilestone3 {
  protocolMetrics(id: "singleton") {
    totalMembers      # Target: >= 100
    totalCircles      # Target: >= 30
    totalValueLocked  # Target: >= 25000e6
    defaultRate       # Target: < 0.03
  }
}
```

---

## Part 8: Team & Traction

### 8.1 Team

**Kunal — Founder & Lead Developer**
- 3rd-year B.Tech CSE, specializing in Cryptography
- Polkadot Fast Grant Alumni (delivered PowerGrid Network)
- Multi-chain experience: Substrate, Solana, Starknet, NEAR
- Hackathon wins: UN COP'24, Soonami, Solana SuperteamDE

### 8.2 Current Traction

| Metric | Value |
|--------|-------|
| Waitlist | 510 users |
| Demo Retention | 94% |
| Completed Test Circles | 12 |
| Default Rate | 0% |
| Test Transactions | 847 |

### 8.3 Existing Work

- **Halo Circles:** Live on testnet with functional ROSCA mechanics
- **Whitepaper:** 1,151 lines, comprehensive technical documentation
- **Smart Contracts:** Core escrow and circle logic complete
- **UI/UX:** Working prototype deployed

---

## Appendix A: Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Smart contract vulnerability | Medium | High | Audit, bug bounty, formal verification |
| Score gaming | Medium | Medium | Multi-factor scoring, Sybil resistance |
| Low adoption | Low | High | Existing waitlist, community-first approach |
| Gas spikes | Low | Medium | Batch operations, L2 optimization |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Key person dependency | Medium | High | Documentation, open source |
| Regulatory uncertainty | Low | Medium | Legal review, compliance-ready design |
| Competition | Medium | Low | First-mover, unique positioning |

---

## Appendix B: Competitive Landscape

| Protocol | Approach | Limitation |
|----------|----------|------------|
| Goldfinch | Off-chain underwriting | Centralized credit decisions |
| Maple | Institutional pools | Not accessible to individuals |
| Spectral | Wallet history scoring | No behavioral data generation |
| Rocifi | ML-based scoring | Opaque methodology |
| **Halo** | On-chain behavioral credit | Transparent, portable, community-driven |

**Halo's Differentiation:**
1. Generates new behavioral data (not just reads existing wallets)
2. Fully on-chain, transparent scoring algorithm
3. Portable scores usable across DeFi
4. Community-centric (ROSCAs) vs institutional focus

---

## Appendix C: Future Roadmap (Post-Grant)

### Phase 3: Score-Gated Lending (Months 7-12)
- Under-collateralized loans based on Halo Score
- Collateral ratios: 150% (500 score) → 80% (800+ score)
- Liquidation engine with health factor monitoring
- Reserve fund for bad debt coverage

### Phase 4: DeFi Integration (Months 12-18)
- Aave adapter for score-based collateral discounts
- Portable attestations via EAS
- Cross-chain score bridging (Arbitrum ↔ Base ↔ Optimism)

### Phase 5: Halo Card — Stablecoin Credit Card (Months 18-24)

**The End Product:** A stablecoin-backed credit card where your Halo Score determines your credit limit.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HALO CARD FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   BUILD CREDIT              EARN SCORE               GET CARD               │
│   ────────────              ──────────               ────────               │
│                                                                             │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │
│   │   Join      │         │   Score     │         │   Halo      │          │
│   │   Circles   │ ──────▶ │   650+      │ ──────▶ │   Card      │          │
│   │   (ROSCAs)  │         │   (Good)    │         │   Issued    │          │
│   └─────────────┘         └─────────────┘         └─────────────┘          │
│                                                                             │
│   On-time payments         Verifiable on-chain     Virtual/Physical card   │
│   Circle completions       Portable across DeFi    USDC-backed credit line │
│   Build history            Score = creditworthiness Score = credit limit    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**How It Works:**

| Score Range | Credit Limit | APR |
|-------------|--------------|-----|
| 650-699 | $500 | 24% |
| 700-749 | $2,000 | 18% |
| 750-799 | $5,000 | 12% |
| 800+ | $10,000+ | 8% |

**Card Features:**
- **Virtual card** issued instantly upon score qualification
- **Physical card** option for users who complete KYC
- **USDC-backed** — spend stablecoins anywhere Visa/Mastercard accepted
- **No bank required** — fully crypto-native credit
- **Auto-repay** from connected wallet or manual payment
- **Score impact** — on-time card payments boost Halo Score

**Revenue Model:**
- **Interchange fees:** 1.5-2.5% of transaction value
- **Interest revenue:** APR on revolving balances
- **Annual fees:** Premium tiers only

**Revenue Potential:**
```
At 100,000 cardholders:
- Average spend: $500-2,000/month per user
- Monthly volume: $50M-200M
- Interchange (2%): $1M-4M/month
- Annual interchange: $12-50M
```

**Why This Matters:**
1. **Complete the loop:** Users don't just build credit — they USE it
2. **Real-world utility:** Spend crypto at any merchant
3. **Sustainable revenue:** Interchange is recurring, scalable
4. **Financial inclusion:** Credit card access without traditional banking

**Implementation Partners (Exploratory):**
- Card issuance: Rain, Immersve, or Baanx
- Payment rails: Visa/Mastercard crypto programs
- Compliance: Licensed issuing bank partner

### Phase 6: Global Expansion (Months 24+)
- Fiat on/off ramps for unbanked users
- Mobile-first UX for emerging markets
- Regional partnerships (India, Latin America, Africa)
- Multi-language support

---

## Appendix D: Document References

| Document | Location | Description |
|----------|----------|-------------|
| MECHANISM.md | /outputs/MECHANISM.md | Full circle, escrow, liquidation specs |
| REPUTATION.md | /outputs/REPUTATION.md | Credit scoring, attestations, Sybil |
| SECURITY.md | /outputs/SECURITY.md | Testing, audits, emergency controls |
| INSTRUMENTATION.md | /outputs/INSTRUMENTATION.md | Subgraph, dashboard, SDK |
| Whitepaper | /outputs/HALO_WHITEPAPER.md | Complete protocol whitepaper |
| Pitch Deck | /outputs/HALO_PITCH_DECK_STELLAR.md | Investor presentation |

---

**END OF DOCUMENT**

*Halo Protocol — Building on-chain credit for the next billion users.*
