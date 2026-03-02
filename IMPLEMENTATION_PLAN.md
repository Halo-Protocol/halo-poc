# Halo Protocol — Master Implementation Plan & Reference

**Version:** 1.0.0
**Last Updated:** March 2026
**Network:** Arbitrum Sepolia (testnet) → Arbitrum One (mainnet)
**Status:** Active Development — Phase 1

> **Purpose:** This is the single source of truth for all technical decisions, architecture, current state, and roadmap. Update this document as the project evolves. Never re-explain context to AI — reference this file.

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Current State](#2-current-state)
3. [Monorepo Architecture](#3-monorepo-architecture)
4. [Smart Contract Architecture](#4-smart-contract-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend & Mobile Architecture](#6-frontend--mobile-architecture)
7. [SDK Architecture](#7-sdk-architecture)
8. [Subgraph Architecture](#8-subgraph-architecture)
9. [Oracle Integration](#9-oracle-integration)
10. [Security Architecture](#10-security-architecture)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Deployment Guide](#12-deployment-guide)
13. [Testing Strategy](#13-testing-strategy)
14. [Phased Roadmap](#14-phased-roadmap)
15. [Key Technical Decisions](#15-key-technical-decisions)
16. [Environment Variables Reference](#16-environment-variables-reference)
17. [Contract Addresses](#17-contract-addresses)
18. [Team & Grants](#18-team--grants)

---

## 1. What We're Building

**Halo Protocol** is on-chain credit infrastructure that transforms community lending circles (ROSCAs) into portable, verifiable credit scores on Arbitrum.

### Core Products

| Product | Phase | Status | Description |
|---------|-------|--------|-------------|
| **Halo Circles** | 1 | In Development | Smart contract ROSCAs — 100% collateralized, zero credit risk |
| **Halo Score** | 2 | Planned | FICO-like on-chain credit score (300–850) from payment behavior |
| **Halo Lend** | 3 | Post-grant | Score-gated under-collateralized lending |
| **Halo Card** | 4 | Future | Stablecoin credit card — Halo Score = credit limit |

### The ROSCA Mechanism

```
5 Members | $100/month | 5 months

Round 1: All contribute $100 → Alice gets $500
Round 2: All contribute $100 → Bob gets $500
Round 3: All contribute $100 → Carol gets $500
Round 4: All contribute $100 → Dave gets $500
Round 5: All contribute $100 → Eve gets $500

Escrow per member: $100 × (5-1) = $400 (returned on completion)
```

### Why Arbitrum
- Low gas for high-frequency micro-transactions
- Native USDC support
- Aave integration for future yield
- Strong subgraph support

---

## 2. Current State

### What Exists (February 2026)
- Core escrow and circle logic complete (prototype)
- Working prototype UI deployed
- 510 waitlist users
- 12 completed test circles
- 847 test transactions
- 0% default rate
- 94% demo retention

### What We're Building Now
This repository is the **production implementation** targeting:
- Arbitrum Sepolia deployment (Milestone 1, Week 8)
- Arbitrum One mainnet (Milestone 2, Week 14)

### Grant Coverage
- **Arbitrum DAO New Protocols & Ideas 3.0**
- $40,000 USD over 24 weeks
- Covers Phase 1 (Circles) + Phase 2 (Reputation)

---

## 3. Monorepo Architecture

```
halo-poc/
├── packages/
│   ├── contracts/          # Foundry — Solidity smart contracts
│   ├── sdk/                # @halo-protocol/sdk — TypeScript SDK
│   ├── subgraph/           # The Graph — event indexing
│   ├── backend/            # NestJS — REST API + WebSocket + Jobs
│   ├── frontend/           # Next.js 14 — Web dashboard
│   └── mobile/             # React Native — Future mobile app (scaffold only)
├── .github/
│   └── workflows/
│       ├── contracts.yml   # Test + coverage + static analysis
│       ├── deploy.yml      # Deployment to Sepolia / mainnet
│       └── release.yml     # SDK publish + subgraph deploy
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CONTRACTS.md
├── scripts/
│   ├── setup.sh            # One-time dev setup
│   └── verify.sh           # Post-deploy verification
├── package.json            # Root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── IMPLEMENTATION_PLAN.md  # (this file)
```

### Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| pnpm | 9.x | Package manager (workspaces) |
| Turborepo | 2.x | Monorepo build orchestration |
| Foundry | latest | Solidity compilation + testing |
| Hardhat | n/a | Not used (Foundry only) |
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | Language for all JS packages |
| Docker | 24+ | Backend containerization |

---

## 4. Smart Contract Architecture

### Contract Map

```
┌─────────────────────────────────────────────────────────────┐
│                    PROXY LAYER (UUPS)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │ CircleFactoryProxy│  │ ScoreProxy    │  │ AttestaProxy│  │
│  └────────┬─────────┘  └───────┬───────┘  └──────┬──────┘  │
│           │                    │                  │         │
├───────────┼────────────────────┼──────────────────┼─────────┤
│           ▼                    ▼                  ▼         │
│  ┌───────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ CircleFactory.sol │  │CreditScore   │  │ HaloAttest  │  │
│  │ • createCircle()  │  │   .sol       │  │  ations.sol │  │
│  │ • registry        │  │ • getScore() │  │ • vouch()   │  │
│  │ • config          │  │ • record()   │  │ • warn()    │  │
│  └────────┬──────────┘  │ • decay()    │  │ • revoke()  │  │
│           │             └──────────────┘  └─────────────┘  │
│           │ deploys                                         │
│           ▼                                                 │
│  ┌───────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   Circle.sol      │  │  Escrow.sol  │  │  Penalty    │  │
│  │ • lifecycle       │  │ • deposit()  │  │  Engine.sol │  │
│  │ • contribute()    │  │ • release()  │  │ • penalize()│  │
│  │ • claimPayout()   │  │ • forfeit()  │  │ • blacklist │  │
│  │ • default logic   │  └──────────────┘  └─────────────┘  │
│  └───────────────────┘                                     │
│                                                             │
│  ┌───────────────────┐  ┌──────────────┐  (Phase 3)        │
│  │  ReserveFund.sol  │  │ Liquidation  │                   │
│  │ • accumulate()    │  │ Engine.sol   │                   │
│  │ • drawdown()      │  └──────────────┘                   │
│  └───────────────────┘                                     │
│                                                             │
│  ┌───────────────────┐                                     │
│  │ HaloTimelock.sol  │  7-day timelock on upgrades         │
│  └───────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

### Contract Specifications

#### Circle.sol
- **State Machine:** PENDING → FUNDING → ACTIVE → COMPLETED | DEFAULTED | CANCELLED
- **Parameters:** 3-10 members, $10-$10,000 contribution, 7-30 day cycles, 24-72h grace
- **Tokens:** USDC, USDT, DAI (ERC20 with IERC20Permit)
- **Fees:** 1% payout fee to treasury, 0.5% to reserve
- **Upgradeable:** UUPS pattern
- **Security:** ReentrancyGuard, AccessControl, Pausable

#### Escrow.sol
- **Formula:** `escrowRequired = contributionAmount × (memberCount - 1)`
- **Operations:** deposit, release (on completion), forfeit (on default)
- **Tracked per:** circleId + member address

#### CreditScore.sol
- **Range:** 300–850, starting at 500
- **Weights:** Payment 40%, Circle Completion 25%, Account Age 15%, Volume 10%, Network 10%
- **Decay:** Time-weighted with inactivity decay
- **Storage:** Efficient packing, events for subgraph

#### HaloAttestations.sol
- **Based on:** Ethereum Attestation Service (EAS) schema
- **Types:** VOUCH (+3/+5), CIRCLE_COMPLETE (+2), WARN (−10), FRAUD (−50)
- **Constraints:** Voucher must have score 600+, max 5 vouches/30 days

#### CircleFactory.sol
- **Purpose:** Beacon proxy deployment for gas-efficient circle creation
- **Registry:** On-chain circle discovery

### Solidity Standards
- Version: `^0.8.26`
- OpenZeppelin: v5.x
- ERC standards: ERC20, ERC1967 (UUPS proxy), ERC712 (typed signatures)
- Named: snake_case storage, camelCase functions, SCREAMING_SNAKE constants

### Contract File Structure
```
packages/contracts/
├── src/
│   ├── Circle.sol
│   ├── CircleFactory.sol
│   ├── Escrow.sol
│   ├── CreditScore.sol
│   ├── HaloAttestations.sol
│   ├── PenaltyEngine.sol
│   ├── ReserveFund.sol
│   ├── governance/
│   │   └── HaloTimelock.sol
│   └── interfaces/
│       ├── ICircle.sol
│       ├── ICreditScore.sol
│       ├── IEscrow.sol
│       ├── IHaloAttestations.sol
│       └── IPenaltyEngine.sol
├── test/
│   ├── Circle.t.sol
│   ├── CreditScore.t.sol
│   ├── Escrow.t.sol
│   ├── HaloAttestations.t.sol
│   ├── PenaltyEngine.t.sol
│   ├── integration/
│   │   └── FullCircleFlow.t.sol
│   └── invariants/
│       ├── CircleInvariant.t.sol
│       └── ScoreInvariant.t.sol
├── script/
│   ├── Deploy.s.sol            # Full deployment
│   ├── DeployTestnet.s.sol     # Sepolia deployment
│   └── Upgrade.s.sol           # Upgrade logic
├── foundry.toml
├── remappings.txt
└── .env.example
```

### Event Reference (for Subgraph)

```solidity
// Circle events
event CircleCreated(uint256 indexed circleId, address creator, CircleParams params);
event MemberJoined(uint256 indexed circleId, address indexed member);
event EscrowDeposited(uint256 indexed circleId, address indexed member, uint256 amount);
event ContributionMade(uint256 indexed circleId, uint256 indexed roundId, address indexed member, uint256 amount, bool onTime);
event PayoutClaimed(uint256 indexed circleId, uint256 indexed roundId, address indexed recipient, uint256 amount);
event DefaultOccurred(uint256 indexed circleId, address indexed member, DefaultType dtype, uint256 escrowForfeited);
event CircleCompleted(uint256 indexed circleId, uint256 timestamp);
event CircleCancelled(uint256 indexed circleId, string reason);
event EscrowReleased(uint256 indexed circleId, address indexed member, uint256 amount);

// Score events
event ScoreUpdated(address indexed user, uint256 oldScore, uint256 newScore, CreditEventType reason);
event ScoreDecayed(address indexed user, uint256 oldScore, uint256 newScore);
event BlacklistUpdated(address indexed user, bool blacklisted, uint256 expiry);

// Attestation events
event AttestationCreated(bytes32 indexed uid, address indexed attester, address indexed recipient, AttestationType atype);
event AttestationRevoked(bytes32 indexed uid, address indexed revoker);
```

---

## 5. Backend Architecture

### Overview
NestJS API server providing:
- REST endpoints for frontend/mobile
- WebSocket for real-time circle updates
- Scheduled jobs for grace period checks, score decay
- Oracle price feed aggregation
- Webhook relay from contracts

### Tech Stack
- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Cache:** Redis
- **Queue:** BullMQ (grace period jobs, score decay)
- **WebSocket:** Socket.io via @nestjs/platform-socket.io
- **Oracle:** Chainlink price feeds via ethers.js
- **Auth:** JWT + SIWE (Sign-in with Ethereum)

### API Structure
```
packages/backend/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── config/
│   │   ├── database.config.ts
│   │   └── blockchain.config.ts
│   ├── modules/
│   │   ├── auth/               # SIWE authentication
│   │   ├── circles/            # Circle CRUD + queries
│   │   ├── scores/             # Credit score queries
│   │   ├── attestations/       # Attestation management
│   │   ├── oracles/            # Chainlink price feeds
│   │   ├── notifications/      # WebSocket + email alerts
│   │   └── analytics/          # Protocol metrics
│   ├── jobs/
│   │   ├── grace-period.job.ts # Check overdue contributions
│   │   ├── score-decay.job.ts  # Apply weekly score decay
│   │   └── metrics.job.ts      # Compute daily metrics
│   ├── blockchain/
│   │   ├── provider.ts         # ethers.js provider
│   │   ├── event-listener.ts   # Contract event listener
│   │   └── contracts/          # Contract ABIs + interfaces
│   └── prisma/
│       └── schema.prisma
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Key API Endpoints

```
Authentication:
  POST /auth/nonce           → SIWE nonce
  POST /auth/verify          → Verify SIWE signature → JWT

Circles:
  GET  /circles              → List circles (filters: status, token)
  POST /circles              → Create circle (requires auth)
  GET  /circles/:id          → Circle details
  GET  /circles/:id/members  → Member list + status
  GET  /circles/:id/rounds   → Round history

Scores:
  GET  /scores/:address      → Credit score + tier + history
  GET  /scores/:address/events → Score event log

Attestations:
  GET  /attestations/:address → Received attestations
  POST /attestations/vouch    → Submit vouch (requires auth)

Protocol:
  GET  /metrics              → Protocol-wide stats
  GET  /metrics/tvl          → TVL history
  GET  /health               → Health check

Oracles:
  GET  /prices               → Current token prices (USDC, DAI, USDT)
```

### Scheduled Jobs

| Job | Frequency | Purpose |
|-----|-----------|---------|
| grace-period-check | Every 5 min | Flag overdue contributions |
| score-decay | Daily 00:00 UTC | Apply inactivity decay |
| metrics-snapshot | Hourly | Cache protocol metrics |
| escrow-monitor | Every 10 min | Alert low escrow |

---

## 6. Frontend & Mobile Architecture

### Web Frontend (Next.js 14)

```
packages/frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (providers, fonts)
│   │   ├── page.tsx           # Landing page
│   │   ├── dashboard/
│   │   │   └── page.tsx       # User dashboard
│   │   ├── circles/
│   │   │   ├── page.tsx       # Browse circles
│   │   │   ├── create/        # Create circle flow
│   │   │   └── [id]/          # Circle detail
│   │   ├── score/
│   │   │   └── page.tsx       # Credit score view
│   │   └── api/               # Next.js API routes (BFF)
│   ├── components/
│   │   ├── ui/                # shadcn/ui base components
│   │   ├── circles/           # Circle-specific components
│   │   ├── score/             # Score visualization
│   │   └── shared/            # Layout, nav, wallet
│   ├── hooks/
│   │   ├── useCircle.ts       # Circle state + actions
│   │   ├── useHaloScore.ts    # Score queries
│   │   └── useWallet.ts       # Wallet connection
│   └── lib/
│       ├── wagmi.ts           # wagmi config (Arbitrum chains)
│       └── sdk.ts             # SDK client init
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── .env.example
```

### Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **Web3:** wagmi v2 + viem v2 (Arbitrum configured)
- **State:** Zustand (minimal, wallet-connected state)
- **Charts:** Recharts (score history, TVL)
- **Wallet:** RainbowKit or ConnectKit

### Mobile App Path (Future — Phase 6)
The architecture is mobile-ready from day one:

1. **SDK** (`packages/sdk`) — Zero DOM dependencies, works in React Native
2. **Backend API** — REST/WebSocket works on mobile identical to web
3. **Shared types** — `packages/types` (future) shared between web/mobile
4. **Components** — Business logic in hooks, UI swappable (RN components vs web)

```
packages/mobile/           # React Native (Expo) — Scaffold for Phase 6
├── app/                   # Expo Router
│   ├── index.tsx          # Onboarding
│   ├── dashboard.tsx
│   ├── circles/
│   └── score.tsx
├── components/            # RN-specific UI components
├── package.json
└── app.json
```

**Mobile Wallet:** WalletConnect v2 (works same as web), or embedded wallet (Privy/Dynamic)

---

## 7. SDK Architecture

### @halo-protocol/sdk

Pure TypeScript, zero DOM dependencies — works in Node, browsers, and React Native.

```typescript
import { HaloSDK } from '@halo-protocol/sdk';

// Web3 SDK (with signer for writes)
const halo = new HaloSDK({
  chainId: 421614,          // Arbitrum Sepolia
  provider: window.ethereum,
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/halo-protocol/sepolia',
});

// Read credit score
const score = await halo.scores.get(address);
// → { score: 720, tier: 'Good', percentile: 78, history: [...] }

// Get circle details
const circle = await halo.circles.get(circleId);
// → { id, status, members, currentRound, ... }

// Create circle (requires signer)
const tx = await halo.circles.create({
  memberCount: 5,
  contributionAmount: parseUnits('100', 6),
  cycleDuration: 30 * 24 * 60 * 60,
  gracePeriod: 48 * 60 * 60,
  token: USDC_ADDRESS,
});

// React hooks (optional import)
import { useHaloScore, useCircle } from '@halo-protocol/sdk/react';
```

### SDK File Structure
```
packages/sdk/
├── src/
│   ├── index.ts               # Public API exports
│   ├── HaloSDK.ts             # Main class
│   ├── types.ts               # All TypeScript types
│   ├── modules/
│   │   ├── CircleModule.ts    # Circle read/write
│   │   ├── ScoreModule.ts     # Credit score queries
│   │   └── AttestationModule.ts
│   ├── graphql/
│   │   └── queries.ts         # GraphQL query strings
│   ├── abis/                  # Contract ABIs (auto-generated)
│   └── react/
│       ├── index.ts
│       ├── useHaloScore.ts
│       ├── useCircle.ts
│       └── HaloProvider.tsx   # Context provider
├── package.json
├── tsconfig.json
└── tsup.config.ts             # Build (CJS + ESM)
```

---

## 8. Subgraph Architecture

### The Graph — Event Indexer

```
packages/subgraph/
├── schema.graphql             # Entity definitions
├── subgraph.yaml              # Manifest (data sources)
├── src/
│   ├── circle-factory.ts      # CircleFactory event handlers
│   ├── circle.ts              # Circle event handlers
│   ├── credit-score.ts        # CreditScore event handlers
│   └── attestations.ts        # Attestation event handlers
├── abis/                      # Contract ABIs
├── tests/                     # Matchstick unit tests
└── package.json
```

### Core Entities

```graphql
type Member @entity {
  id: ID!                      # wallet address
  score: Int!
  tier: String!
  circles: [CircleMember!]!
  creditEvents: [CreditEvent!]!
  attestationsReceived: [Attestation!]!
  totalContributions: BigInt!
  onTimePayments: Int!
  defaults: Int!
  joinedAt: BigInt!
}

type Circle @entity {
  id: ID!                      # circleId
  creator: Member!
  status: String!              # PENDING|FUNDING|ACTIVE|COMPLETED|DEFAULTED
  memberCount: Int!
  contributionAmount: BigInt!
  token: String!
  rounds: [Round!]!
  members: [CircleMember!]!
  tvl: BigInt!
  createdAt: BigInt!
  completedAt: BigInt
}

type ProtocolMetrics @entity {
  id: ID!                      # "singleton"
  totalMembers: Int!
  totalCircles: Int!
  activeCircles: Int!
  totalValueLocked: BigInt!
  defaultRate: BigDecimal!
  averageScore: Int!
  updatedAt: BigInt!
}
```

### Deployment Targets
- **Testnet:** The Graph hosted service (Arbitrum Sepolia)
- **Mainnet:** The Graph decentralized network (Arbitrum One)

---

## 9. Oracle Integration

### Chainlink Price Feeds (Phase 3)

For Phase 3 lending, collateral ratios are USD-based. Chainlink feeds used:

| Feed | Address (Arbitrum One) | Purpose |
|------|------------------------|---------|
| USDC/USD | 0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3 | Stablecoin peg verification |
| ETH/USD | 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612 | Collateral valuation |
| ARB/USD | 0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D7 | ARB collateral |

**Chainlink Automation (Keepers):**
- Grace period expiry triggers (fire when `block.timestamp > gracePeriodEnd`)
- Score decay triggers (weekly)
- Reserve fund rebalancing

### Oracle Security
- Staleness check: reject prices > 1 hour old
- Heartbeat verification per feed
- Multi-oracle aggregation for Phase 3 (Chainlink + Band Protocol fallback)

---

## 10. Security Architecture

### Audit Plan
```
Week 14: Code freeze
Week 15-17: Competitive audit (Code4rena or Sherlock)
Week 18: Remediation
Week 19: Re-review
Week 20: Mainnet deploy
```

### Static Analysis (Automated in CI)
- **Slither:** Every PR against contracts
- **Mythril:** Weekly symbolic execution
- **Echidna:** Fuzz testing (100K+ runs) in CI

### Circuit Breakers

| Phase | TVL Cap | Max Circle | Max Circles/User |
|-------|---------|------------|------------------|
| Phase 1 | $100K | $10K | 3 |
| Phase 2 | $500K | $25K | 5 |
| Phase 3 | $2M | $50K | 10 |

### Emergency Controls
- **Global Pause:** 2/3 multisig or automated (>10 defaults/hour)
- **Recovery:** 3/5 multisig
- **Upgrade Timelock:** 7 days (HaloTimelock.sol)

### Multisig Setup
- **Network:** Arbitrum Safe
- **Threshold:** 2/3 for operations, 3/5 for emergencies
- **Signers:** Kunal + 2 trusted community members (to be named)

### Bug Bounty (Post-Mainnet)
- **Platform:** Immunefi
- **Pool:** $10K initial
- Critical: $5-10K | High: $2-5K | Medium: $500-2K | Low: $100-500

---

## 11. CI/CD Pipeline

### GitHub Actions Workflows

#### `contracts.yml` — Triggered on every PR touching `packages/contracts/`
```yaml
Steps:
  1. Install Foundry
  2. Run forge build
  3. Run forge test --gas-report
  4. Run forge coverage (fail if <95%)
  5. Run Slither static analysis
  6. Comment coverage on PR
```

#### `deploy-testnet.yml` — Triggered on merge to `main`
```yaml
Steps:
  1. Run full test suite
  2. Deploy to Arbitrum Sepolia
  3. Verify contracts on Arbiscan
  4. Update subgraph deployment
  5. Run smoke tests against deployed contracts
  6. Notify on Discord
```

#### `release.yml` — Triggered on version tags (`v*`)
```yaml
Steps:
  1. Build SDK (tsup)
  2. Publish to npm (@halo-protocol/sdk)
  3. Deploy subgraph to mainnet endpoint
  4. Create GitHub release with changelog
```

#### `backend.yml` — Triggered on `packages/backend/` changes
```yaml
Steps:
  1. TypeScript type-check
  2. Unit tests
  3. Integration tests
  4. Build Docker image
  5. Push to registry (on main)
  6. Deploy to Railway/Fly.io (on main)
```

### Branch Strategy
```
main              # Production-ready code
  └── dev         # Active development
        ├── feat/circle-v1
        ├── feat/credit-score
        └── fix/escrow-bug
```

---

## 12. Deployment Guide

### Prerequisites
```bash
# Install tools
curl -L https://foundry.paradigm.xyz | bash
foundryup
npm install -g pnpm
pnpm install

# Environment
cp .env.example .env
# Fill in: PRIVATE_KEY, RPC_URL, ARBISCAN_API_KEY, etc.
```

### Deploy to Arbitrum Sepolia (Testnet)
```bash
cd packages/contracts
forge script script/DeployTestnet.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

# Output: deployment addresses in deployments/sepolia.json
```

### Deploy Subgraph
```bash
cd packages/subgraph
npm run codegen
npm run build
graph deploy --studio halo-protocol-sepolia
```

### Deploy Backend
```bash
cd packages/backend
docker build -t halo-backend .
docker push halo-backend
# Or: fly deploy (using fly.toml)
```

### Deploy Frontend
```bash
cd packages/frontend
pnpm build
# Vercel deployment (configured in vercel.json)
vercel --prod
```

---

## 13. Testing Strategy

### Smart Contract Testing (Foundry)

**Coverage Targets:**
| Contract | Target | Critical Paths |
|----------|--------|----------------|
| Escrow.sol | 98% | deposit, release, forfeit |
| Circle.sol | 98% | lifecycle, payments, defaults |
| CreditScore.sol | 95% | calculation, decay, bounds |
| HaloAttestations.sol | 95% | create, verify, revoke |

**Test Categories:**
1. **Unit Tests** (`*.t.sol`) — Each function in isolation
2. **Integration Tests** (`integration/`) — Cross-contract flows
3. **Invariant Tests** (`invariants/`) — Echidna/Foundry property testing
4. **Fork Tests** — Against Arbitrum mainnet fork with real USDC

**Key Test Scenarios:**
- Full circle lifecycle (happy path)
- Soft default → escrow deduction → circle continues
- Hard default → member removal → circle restructure
- Early payout recipient → score boost
- Score decay after 30/90/180 days inactivity
- Sybil attack simulation (coordinated default)
- Reentrancy attack prevention
- Upgrade via proxy (storage preservation)

### Backend Testing
- Unit: Jest for services/jobs
- Integration: Supertest for API endpoints
- Blockchain: Hardhat node fork for event listener tests

### Frontend Testing
- Unit: Vitest for hooks/utils
- E2E: Playwright (key user flows)

---

## 14. Phased Roadmap

### Grant Period (Months 1–6)

#### Phase 1: Circles (Months 1–3, Weeks 1–8)
- [x] Design finalized
- [ ] Repository setup + CI/CD
- [ ] Core contracts: Circle, Escrow, CircleFactory
- [ ] 95%+ test coverage
- [ ] Deploy to Arbitrum Sepolia
- [ ] Subgraph indexing live
- [ ] Basic frontend: Join/Create/Contribute/Claim
- [ ] **M1 Target:** 50 test users, 20 circles, 90% coverage

#### Phase 2: Reputation (Months 4–6, Weeks 9–24)
- [ ] CreditScore.sol + PenaltyEngine.sol
- [ ] HaloAttestations.sol
- [ ] Score decay job
- [ ] SDK published to npm
- [ ] Code4rena/Sherlock audit
- [ ] Deploy to Arbitrum One mainnet
- [ ] Dune dashboard live
- [ ] **M2 Target:** 50 mainnet users, $10K TVL, <5% default
- [ ] **M3 Target:** 100 users, $25K TVL, audit complete
- [ ] **M4 Target:** 150 users, $50K TVL, SDK published

### Post-Grant (Months 7–24)

#### Phase 3: Lending (Months 7–12)
- Under-collateralized loans (score-gated)
- Chainlink oracle integration
- Liquidation engine
- Aave adapter for score discounts

#### Phase 4: Cross-Chain (Months 12–18)
- Score bridging (Arbitrum ↔ Base ↔ Optimism)
- EAS portable attestations
- Cross-chain circle participation

#### Phase 5: Halo Card (Months 18–24)
- Stablecoin credit card
- Score = credit limit ($500–$10K+)
- Card partners: Rain, Immersve, or Baanx
- Visa/Mastercard rails

#### Phase 6: Mobile (Months 18–24)
- React Native Expo app
- Embedded wallet (Privy)
- Push notifications for contributions
- Emerging market focus (India, LatAm, Africa)

---

## 15. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contract framework | Foundry | Faster tests, native Solidity, fuzz testing |
| Proxy pattern | UUPS | Lower gas than Transparent, clean separation |
| Frontend framework | Next.js 14 | SSR for SEO, App Router, Vercel deployment |
| Mobile framework | React Native + Expo | Code sharing with web hooks/SDK |
| API framework | NestJS | TypeScript-native, scalable, module system |
| Database | PostgreSQL | Relational, Prisma ORM, great for analytics |
| Monorepo | pnpm + Turborepo | Fast, caching, proper workspace isolation |
| Token standard | ERC20 (USDC first) | Compliance-ready, native Arbitrum USDC |
| Score storage | On-chain (events) + Subgraph | Transparency + query speed |
| Auth | SIWE (Sign-in with Ethereum) | Walletless UX + web3-native |
| Attestations | Custom + EAS compatibility | Portable, verifiable, composable |

---

## 16. Environment Variables Reference

```bash
# Root .env.example

# Blockchain
ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_ONE_RPC=https://arb1.arbitrum.io/rpc
PRIVATE_KEY=0x...                          # Deployer key (never commit!)
ARBISCAN_API_KEY=...                       # For contract verification

# Contracts (populated after deploy)
CIRCLE_FACTORY_ADDRESS=
CREDIT_SCORE_ADDRESS=
ATTESTATIONS_ADDRESS=
RESERVE_FUND_ADDRESS=

# Backend
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
BACKEND_PORT=3001

# Subgraph
SUBGRAPH_URL_SEPOLIA=https://api.thegraph.com/subgraphs/name/halo-protocol/sepolia
SUBGRAPH_URL_MAINNET=https://api.thegraph.com/subgraphs/name/halo-protocol/mainnet

# Frontend
NEXT_PUBLIC_CHAIN_ID=421614               # Sepolia=421614, One=42161
NEXT_PUBLIC_BACKEND_URL=https://api.halo.finance
NEXT_PUBLIC_SUBGRAPH_URL=...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# Oracles
CHAINLINK_ETH_USD=0x...
CHAINLINK_USDC_USD=0x...

# Multisig
SAFE_ADDRESS=
TIMELOCK_ADDRESS=

# Notifications (optional)
DISCORD_WEBHOOK_URL=
```

---

## 17. Contract Addresses

### Arbitrum Sepolia (421614) — Testnet

| Contract | Address | Deployed |
|----------|---------|---------|
| CircleFactory | TBD | — |
| Circle (Implementation) | TBD | — |
| Escrow | TBD | — |
| CreditScore | TBD | — |
| HaloAttestations | TBD | — |
| PenaltyEngine | TBD | — |
| ReserveFund | TBD | — |
| HaloTimelock | TBD | — |
| USDC (Native) | 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d | Existing |

### Arbitrum One (42161) — Mainnet (Post-Audit)

| Contract | Address | Deployed |
|----------|---------|---------|
| All contracts | TBD | Week 20+ |
| USDC (Native) | 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 | Existing |

---

## 18. Team & Grants

**Kunal — Founder & Lead Developer**
- B.Tech CSE (3rd year), Cryptography specialization
- Polkadot Fast Grant Alumni (delivered PowerGrid Network)
- Multi-chain: Substrate, Solana, Starknet, NEAR
- Hackathon wins: UN COP'24, Soonami, Solana SuperteamDE

**Grant:** Arbitrum DAO New Protocols & Ideas 3.0 — $40,000 USD over 24 weeks

**Milestone Schedule:**
| Milestone | Week | Payment | Metric |
|-----------|------|---------|--------|
| M1 | 8 | $10,000 | 50 test users, 20 circles, 90% coverage |
| M2 | 14 | $10,000 | 50 mainnet users, $10K TVL |
| M3 | 20 | $10,000 | 100 users, $25K TVL, audit done |
| M4 | 24 | $10,000 | 150 users, $50K TVL, SDK on npm |

---

*Last updated: March 2026 — Update this document as the project evolves.*
