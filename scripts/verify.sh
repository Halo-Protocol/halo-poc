#!/usr/bin/env bash
# =============================================================================
# Halo Protocol — Post-Deploy Verification Script
# Verifies all contracts on Arbiscan and runs smoke tests
# =============================================================================
set -euo pipefail

source .env

BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[verify]${NC} $1"; }
ok()   { echo -e "${GREEN}[ok]${NC} $1"; }
fail() { echo -e "${RED}[fail]${NC} $1"; exit 1; }

DEPLOYMENT_FILE="packages/contracts/deployments/sepolia.json"
[ -f "$DEPLOYMENT_FILE" ] || fail "Deployment file not found: $DEPLOYMENT_FILE"

log "Loading deployment addresses..."
FACTORY=$(jq -r '.circleFactory' "$DEPLOYMENT_FILE")
CREDIT_SCORE=$(jq -r '.creditScore' "$DEPLOYMENT_FILE")
ATTESTATIONS=$(jq -r '.attestations' "$DEPLOYMENT_FILE")
PENALTY=$(jq -r '.penaltyEngine' "$DEPLOYMENT_FILE")
RESERVE=$(jq -r '.reserveFund' "$DEPLOYMENT_FILE")
TIMELOCK=$(jq -r '.timelock' "$DEPLOYMENT_FILE")

log "Verifying CircleFactory @ $FACTORY"
forge verify-contract \
  --chain-id 421614 \
  --etherscan-api-key "$ARBISCAN_API_KEY" \
  "$FACTORY" \
  packages/contracts/src/CircleFactory.sol:CircleFactory

log "Verifying CreditScore @ $CREDIT_SCORE"
forge verify-contract \
  --chain-id 421614 \
  --etherscan-api-key "$ARBISCAN_API_KEY" \
  "$CREDIT_SCORE" \
  packages/contracts/src/CreditScore.sol:CreditScore

log "Verifying HaloAttestations @ $ATTESTATIONS"
forge verify-contract \
  --chain-id 421614 \
  --etherscan-api-key "$ARBISCAN_API_KEY" \
  "$ATTESTATIONS" \
  packages/contracts/src/HaloAttestations.sol:HaloAttestations

log "Verifying PenaltyEngine @ $PENALTY"
forge verify-contract \
  --chain-id 421614 \
  --etherscan-api-key "$ARBISCAN_API_KEY" \
  "$PENALTY" \
  packages/contracts/src/PenaltyEngine.sol:PenaltyEngine

log "Verifying ReserveFund @ $RESERVE"
forge verify-contract \
  --chain-id 421614 \
  --etherscan-api-key "$ARBISCAN_API_KEY" \
  "$RESERVE" \
  packages/contracts/src/ReserveFund.sol:ReserveFund

ok "All contracts verified on Arbiscan"

# ---- Smoke Tests ----
log "Running smoke tests against deployed contracts..."

cd packages/contracts
forge script script/SmokeTest.s.sol \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC" \
  --broadcast \
  --private-key "$PRIVATE_KEY"

ok "Smoke tests passed"

# ---- Notify ----
if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
  curl -s -X POST "$DISCORD_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"✅ Halo Protocol deployed & verified on Arbitrum Sepolia\nFactory: \`$FACTORY\`\"}"
fi

echo ""
echo "Deployment verified successfully!"
echo "View on Arbiscan: https://sepolia.arbiscan.io/address/$FACTORY"
