# Halo Protocol — Backend API Reference

**Base URL (Testnet):** `https://api-sepolia.halo.finance/api/v1`
**Base URL (Mainnet):** `https://api.halo.finance/api/v1`
**Auth:** Bearer JWT (obtained via SIWE flow)

---

## Authentication (SIWE)

### GET `/auth/nonce`
Get a nonce for SIWE authentication.

**Query:** `?address=0x...`

**Response:**
```json
{
  "nonce": "a3f9b2c...",
  "expiresAt": "2026-03-02T12:05:00.000Z"
}
```

### POST `/auth/verify`
Verify a SIWE signature and receive a JWT.

**Body:**
```json
{
  "message": "halo.finance wants you to sign in with your Ethereum account:\n0x...\n\nSign in to Halo Protocol\n\nURI: https://halo.finance\nVersion: 1\nChain ID: 421614\nNonce: a3f9b2c...\nIssued At: 2026-03-02T12:00:00.000Z",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "address": "0x..."
}
```

---

## Circles

### GET `/circles`
List circles. Public.

**Query params:**
- `status` — `PENDING | ACTIVE | COMPLETED | DEFAULTED` (optional)
- `page` — page number (default: 1)
- `limit` — items per page, max 100 (default: 20)

**Response:**
```json
{
  "circles": [
    {
      "id": "1",
      "status": "PENDING",
      "creator": { "id": "0x..." },
      "memberCount": 5,
      "contributionAmount": "100000000",
      "token": "0x75faf1...",
      "cycleDuration": 2592000,
      "gracePeriod": 172800,
      "tvl": "400000000",
      "members": [{ "member": { "id": "0x...", "score": 650 }, "isActive": true }],
      "createdAt": "1741132800"
    }
  ],
  "page": 1,
  "limit": 20
}
```

### GET `/circles/:id`
Get circle details. Public.

### GET `/circles/:id/members`
Get circle members. Public.

### GET `/circles/:id/rounds`
Get round history. Public.

---

## Scores

### GET `/scores/:address`
Get credit score for an address. Public.

**Response:**
```json
{
  "address": "0x...",
  "score": 720,
  "tier": "GOOD",
  "percentile": 80,
  "totalContributions": "1200000000",
  "onTimePayments": 12,
  "defaults": 0,
  "circlesCompleted": 2,
  "joinedAt": "1738540800",
  "lastActivity": "1741132800",
  "initialized": true
}
```

### GET `/scores/:address/history?limit=20`
Get score event history. Public.

**Response:**
```json
{
  "events": [
    {
      "id": "0x...-123",
      "score": 720,
      "delta": 10,
      "reason": "ON_TIME_PAYMENT",
      "timestamp": "1741132800",
      "txHash": "0x..."
    }
  ]
}
```

### GET `/scores/:address/tier`
Get tier only (lightweight).

---

## Metrics (Analytics)

### GET `/metrics`
Protocol-wide stats. Public. Cached 30s.

**Response:**
```json
{
  "totalMembers": 87,
  "totalCircles": 31,
  "activeCircles": 12,
  "completedCircles": 18,
  "totalValueLocked": "145000000000",
  "defaultRate": "0.012",
  "averageScore": 634,
  "totalPayouts": "2900000000000"
}
```

### GET `/metrics/tvl?days=30`
TVL history. Public. Cached 5min.

### GET `/metrics/milestones`
Grant milestone tracking. Public.

**Response:**
```json
{
  "M1": {
    "achieved": true,
    "targets": { "members": 50, "circles": 20 },
    "actual": { "members": 87, "circles": 31 }
  },
  "M2": {
    "achieved": false,
    "targets": { "members": 50, "tvl": 10000, "defaultRate": 0.05 },
    "actual": { "members": 87, "tvl": 145, "defaultRate": 0.012 }
  }
}
```

### GET `/health`
Health check. Public.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "blockchain": "connected",
  "chainId": 421614
}
```

---

## WebSocket Events

**Endpoint:** `wss://api-sepolia.halo.finance/ws`

**Auth:** Pass JWT in `auth.token` handshake option.

### Subscribe to circle events:
```js
socket.emit('join:circle', { circleId: '1' });
```

### Events received:
```
circle:contribution  — { circleId, roundId, member, amount, onTime }
circle:payout        — { circleId, roundId, recipient, amount }
circle:default       — { type: 'SOFT'|'HARD', circleId, member, ... }
circle:new           — { circleId, creator }
score:updated        — { user, oldScore, newScore, reason, delta }
```

---

## Error Format

All errors follow:
```json
{
  "statusCode": 400,
  "message": "Human-readable error",
  "error": "Bad Request"
}
```

Common codes: `400` Bad Request, `401` Unauthorized, `404` Not Found, `429` Rate Limited, `500` Server Error
