#!/usr/bin/env bash
# =============================================================================
# Halo Protocol — One-Time Development Environment Setup
# =============================================================================
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $1"; }
ok()   { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
fail() { echo -e "${RED}[fail]${NC} $1"; exit 1; }

echo ""
echo "======================================"
echo " Halo Protocol — Dev Setup"
echo "======================================"
echo ""

# ---- Prerequisites check ----
log "Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js 20+ required. Install: https://nodejs.org"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VERSION" -ge 20 ] || fail "Node.js 20+ required (found v$NODE_VERSION)"
ok "Node.js $(node -v)"

command -v pnpm >/dev/null 2>&1 || {
  log "Installing pnpm..."
  npm install -g pnpm
}
ok "pnpm $(pnpm -v)"

command -v docker >/dev/null 2>&1 || warn "Docker not found — backend services won't start"

if ! command -v forge >/dev/null 2>&1; then
  log "Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash
  "$HOME/.foundry/bin/foundryup"
fi
ok "forge $(forge --version | head -1)"

# ---- Install dependencies ----
log "Installing pnpm dependencies..."
pnpm install
ok "Dependencies installed"

# ---- Environment ----
if [ ! -f .env ]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
  warn "Fill in .env with your RPC URLs and private key before deploying"
else
  ok ".env already exists"
fi

# ---- Foundry libs ----
log "Installing Foundry dependencies..."
cd packages/contracts
if [ ! -d lib/forge-std ]; then
  forge install foundry-rs/forge-std --no-commit
fi
if [ ! -d lib/openzeppelin-contracts ]; then
  forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
fi
if [ ! -d lib/openzeppelin-contracts-upgradeable ]; then
  forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.0.2 --no-commit
fi
ok "Foundry libs installed"

# ---- Build contracts ----
log "Building contracts..."
forge build
ok "Contracts compiled"

# ---- Run tests ----
log "Running contract tests..."
forge test --summary
ok "Tests passing"
cd ../..

# ---- Start dev services (optional) ----
if command -v docker >/dev/null 2>&1; then
  log "Starting Postgres + Redis..."
  docker compose -f packages/backend/docker-compose.yml up -d postgres redis
  sleep 3
  ok "Database services running"
fi

echo ""
echo "======================================"
echo -e "${GREEN} Setup complete!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Fill in .env with your RPC URL and private key"
echo "  2. pnpm dev           — start all services"
echo "  3. scripts/deploy.sh  — deploy to Arbitrum Sepolia"
echo ""
