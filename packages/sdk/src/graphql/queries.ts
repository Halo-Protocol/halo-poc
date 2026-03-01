// =============================================================================
// GraphQL Queries for The Graph Subgraph
// =============================================================================

export const GET_CREDIT_SCORE = `
  query GetCreditScore($address: ID!) {
    member(id: $address) {
      id
      score
      tier
      onTimePayments
      defaults
      totalContributions
      circlesCompleted
      joinedAt
      lastActivity
      creditEvents(orderBy: timestamp, orderDirection: desc, first: 50) {
        id
        score
        tier
        delta
        reason
        timestamp
      }
    }
  }
`;

export const GET_CIRCLE = `
  query GetCircle($circleId: ID!) {
    circle(id: $circleId) {
      id
      status
      creator {
        id
      }
      memberCount
      contributionAmount
      token
      cycleDuration
      gracePeriod
      currentRoundId
      startTime
      completedAt
      tvl
      members {
        member {
          id
          score
          tier
        }
        hasDeposited
        isActive
        payoutRound
        paidRounds
        escrowRemaining
      }
      rounds(orderBy: roundId) {
        roundId
        recipient {
          id
        }
        deadline
        graceDeadline
        totalCollected
        payoutClaimed
      }
    }
  }
`;

export const GET_CIRCLES = `
  query GetCircles($status: String, $first: Int, $skip: Int) {
    circles(
      where: { status: $status }
      first: $first
      skip: $skip
      orderBy: createdAt
      orderDirection: desc
    ) {
      id
      status
      creator {
        id
      }
      memberCount
      contributionAmount
      token
      tvl
      members {
        member { id }
        isActive
      }
    }
  }
`;

export const GET_USER_CIRCLES = `
  query GetUserCircles($address: ID!) {
    member(id: $address) {
      circles(orderBy: circle__createdAt, orderDirection: desc) {
        circle {
          id
          status
          memberCount
          contributionAmount
          token
          currentRoundId
          tvl
        }
        payoutRound
        paidRounds
        isActive
      }
    }
  }
`;

export const GET_PROTOCOL_METRICS = `
  query GetProtocolMetrics {
    protocolMetrics(id: "singleton") {
      totalMembers
      totalCircles
      activeCircles
      completedCircles
      totalValueLocked
      defaultRate
      averageScore
      totalPayouts
      updatedAt
    }
  }
`;

export const GET_ATTESTATIONS = `
  query GetAttestations($address: ID!) {
    member(id: $address) {
      attestationsReceived(orderBy: timestamp, orderDirection: desc) {
        uid
        type
        attester {
          id
          score
        }
        timestamp
        revoked
        data
      }
    }
  }
`;

export const VERIFY_MILESTONE = `
  query VerifyMilestone {
    protocolMetrics(id: "singleton") {
      totalMembers
      totalCircles
      activeCircles
      totalValueLocked
      defaultRate
      averageScore
    }
  }
`;
