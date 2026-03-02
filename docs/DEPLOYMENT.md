# Halo Protocol — Deployment Guide

**Target:** Arbitrum Sepolia (testnet) → Arbitrum One (mainnet post-audit)

---

## Prerequisites

```bash
# 1. Run the setup script (first time only)
bash scripts/setup.sh

# 2. Verify your .env is populated
cat .env | grep -E "^(PRIVATE_KEY|ARBITRUM_SEPOLIA_RPC|ARBISCAN_API_KEY)"
```

Required `.env` variables:
```
PRIVATE_KEY=0x...                    # Deployer wallet (fund with ETH first)
ARBITRUM_SEPOLIA_RPC=https://...    # Arbitrum Sepolia RPC
ARBISCAN_API_KEY=...                 # From arbiscan.io/myapikey
TREASURY_ADDRESS=0x...               # Receives 1% protocol fee
RESERVE_MULTISIG_ADDRESS=0x...       # Safe multisig for reserve fund
DEPLOYER_ADDRESS=0x...               # Your deployer address
```

---

## Step 1: Compile & Test Contracts

```bash
cd packages/contracts

# Compile
forge build

# Full test suite (must pass before deploy)
forge test --gas-report

# Coverage (target: 95%+)
forge coverage

# Static analysis (review all findings before deploy)
slither . --config-file slither.config.json
```

---

## Step 2: Deploy to Arbitrum Sepolia

```bash
cd packages/contracts

# Dry run (no broadcast)
forge script script/DeployTestnet.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY

# Live deploy
forge script script/DeployTestnet.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  --delay 10
```

**Output:** `deployments/sepolia.json` — contains all contract addresses.

---

## Step 3: Update Configuration Files

After deployment, update these files with real addresses from `deployments/sepolia.json`:

```bash
# 1. SDK types.ts
vi packages/sdk/src/types.ts
# Update KNOWN_ADDRESSES[421614] block

# 2. Subgraph manifest
vi packages/subgraph/subgraph.yaml
# Update all address: fields

# 3. Frontend env
vi packages/frontend/.env.local
# Update NEXT_PUBLIC_CIRCLE_FACTORY_ADDRESS, etc.

# 4. Backend env
vi packages/backend/.env
# Update CIRCLE_FACTORY_ADDRESS, etc.
```

Or use the automated script:
```bash
# (Requires jq)
DEPLOYMENT=packages/contracts/deployments/sepolia.json
FACTORY=$(jq -r '.circleFactory' $DEPLOYMENT)
sed -i "s/CIRCLE_FACTORY_ADDRESS=.*/CIRCLE_FACTORY_ADDRESS=$FACTORY/" .env
# Repeat for other addresses...
```

---

## Step 4: Deploy Subgraph

```bash
cd packages/subgraph

# Generate types
npm run codegen

# Build
npm run build

# Authenticate (one-time)
graph auth --studio <YOUR_DEPLOY_KEY>

# Deploy
npm run deploy:studio
```

Wait for sync to complete (~5-10 minutes). Check status:
```
https://thegraph.com/studio/subgraph/halo-protocol-sepolia
```

---

## Step 5: Deploy Backend

**Option A: Docker (local/VPS)**
```bash
cd packages/backend

# Build image
docker build -t halo-backend:latest ../../

# Start with compose
docker compose up -d

# Run migrations
docker compose exec backend npx prisma migrate deploy
```

**Option B: Fly.io**
```bash
cd packages/backend
fly deploy
```

**Option C: Railway**
```bash
# Push via GitHub Actions (auto on merge to main)
git push origin main
```

Verify backend is live:
```bash
curl https://api-sepolia.halo.finance/api/v1/health
```

---

## Step 6: Deploy Frontend

```bash
cd packages/frontend

# Build
pnpm build

# Deploy to Vercel
vercel --prod
```

Or auto-deploy via GitHub Actions on merge to `main`.

---

## Step 7: Verify Everything

```bash
# Run post-deploy verification
bash scripts/verify.sh
```

This:
1. Verifies all contracts on Arbiscan
2. Runs smoke tests
3. Sends Discord notification

---

## Step 8: Add Accepted Tokens

After deployment, add USDC as accepted token:

```bash
cast send $CIRCLE_FACTORY_ADDRESS \
  "addToken(address)" \
  0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY
```

---

## Mainnet Deployment (Post-Audit)

After successful audit (Week 15-18):

1. Update `ARBITRUM_SEPOLIA_RPC` → `ARBITRUM_ONE_RPC` in script
2. Use `forge script script/Deploy.s.sol` (not DeployTestnet)
3. Enable Chainlink automation for keeper jobs
4. Set up Safe multisig for treasury and reserve
5. Initialize timelock (7-day delay on upgrades)
6. TVL cap starts at $100K → raise after first 2 weeks

---

## Emergency Procedures

### Pause all circles (2/3 multisig required)
```bash
cast send $CIRCLE_ADDRESS "pause()" --from $MULTISIG_ADDRESS
```

### Upgrade contract (7-day timelock)
```bash
# 1. Queue upgrade
cast send $TIMELOCK_ADDRESS "schedule(...)" ...

# 2. Wait 7 days

# 3. Execute
cast send $TIMELOCK_ADDRESS "execute(...)" ...
```

### Contact
- Telegram: @kunal_halo
- Discord: halo-protocol server
