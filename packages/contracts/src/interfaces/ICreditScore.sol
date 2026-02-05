// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICreditScore — Interface for Halo Credit Score contract
/// @notice Defines the scoring API queryable by external protocols
interface ICreditScore {
    // =========================================================================
    // ENUMS
    // =========================================================================

    enum CreditTier {
        POOR, // 300–579
        FAIR, // 580–669
        GOOD, // 670–739
        VERY_GOOD, // 740–799
        EXCEPTIONAL // 800–850
    }

    enum CreditEventType {
        ON_TIME_PAYMENT,
        EARLY_PAYMENT,
        GRACE_PERIOD_PAYMENT,
        SOFT_DEFAULT,
        HARD_DEFAULT,
        CIRCLE_COMPLETION,
        STREAK_3_MONTH,
        STREAK_6_MONTH,
        STREAK_12_MONTH,
        VOUCH_RECEIVED,
        FRAUD_REPORT,
        INACTIVITY_DECAY
    }

    // =========================================================================
    // STRUCTS
    // =========================================================================

    struct ScoreSnapshot {
        uint256 score;
        CreditTier tier;
        uint256 timestamp;
        CreditEventType reason;
        int256 delta; // Positive or negative change
    }

    struct ScoreComponents {
        uint256 paymentHistory; // 0–340 (40%)
        uint256 circleCompletion; // 0–212 (25%)
        uint256 accountAge; // 0–127 (15%)
        uint256 volumeDiversity; // 0–85 (10%)
        uint256 networkTrust; // 0–85 (10%)
    }

    // =========================================================================
    // EVENTS
    // =========================================================================

    event ScoreUpdated(
        address indexed user, uint256 indexed oldScore, uint256 indexed newScore, CreditEventType reason, int256 delta
    );
    event ScoreInitialized(address indexed user, uint256 initialScore, uint256 timestamp);
    event InactivityDecayApplied(address indexed user, uint256 oldScore, uint256 newScore, uint256 inactiveDays);

    // =========================================================================
    // EXTERNAL (WRITE) — Called by authorized contracts only
    // =========================================================================

    /// @notice Record an on-time payment event
    function recordPayment(address user, CreditEventType ptype, uint256 contributionAmount) external;

    /// @notice Record a default event
    function recordDefault(address user, bool isHard) external;

    /// @notice Record circle completion bonus
    function recordCircleCompletion(address user, uint256 circleSize) external;

    /// @notice Apply streak bonus
    function recordStreak(address user, uint256 streakMonths) external;

    /// @notice Apply vouch from attestation contract
    function applyVouch(address recipient, address voucher, uint256 voucherScore) external;

    /// @notice Apply fraud report penalty
    function applyFraudReport(address user) external;

    /// @notice Trigger decay calculation (called by keeper/job)
    function applyDecay(address user) external;

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get current score (300–850)
    function getScore(address user) external view returns (uint256);

    /// @notice Get credit tier based on score
    function getTier(address user) external view returns (CreditTier);

    /// @notice Get full score breakdown
    function getScoreComponents(address user) external view returns (ScoreComponents memory);

    /// @notice Get score history (last N events)
    function getScoreHistory(address user, uint256 limit) external view returns (ScoreSnapshot[] memory);

    /// @notice Check if user has been initialized
    function isInitialized(address user) external view returns (bool);

    /// @notice Get time of last activity
    function getLastActivity(address user) external view returns (uint256);

    /// @notice Check if score meets threshold
    function meetsThreshold(address user, uint256 minimumScore) external view returns (bool);
}
