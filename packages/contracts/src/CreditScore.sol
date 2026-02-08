// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ICreditScore} from "./interfaces/ICreditScore.sol";

/// @title CreditScore — Halo Protocol On-Chain Credit Scoring
/// @notice FICO-like credit scoring (300–850) derived from on-chain payment behavior.
///
/// Score Components:
///   - Payment History    40%  (max 340 pts)
///   - Circle Completion  25%  (max 212 pts)
///   - Account Age        15%  (max 127 pts)
///   - Volume/Diversity   10%  (max 85 pts)
///   - Network Trust      10%  (max 85 pts)
///
/// Starting score: 500 (Fair tier)
/// Score range: 300–850
contract CreditScore is ICreditScore, AccessControlUpgradeable, UUPSUpgradeable {
    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 public constant ATTESTATION_ROLE = keccak256("ATTESTATION_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // CONSTANTS — Score bounds
    // =========================================================================

    uint256 public constant MIN_SCORE = 300;
    uint256 public constant MAX_SCORE = 850;
    uint256 public constant INITIAL_SCORE = 500;

    // Payment event deltas (in basis points of 1 score point)
    int256 public constant DELTA_ON_TIME = 10;
    int256 public constant DELTA_EARLY = 12;
    int256 public constant DELTA_GRACE = 5;
    int256 public constant DELTA_SOFT_DEFAULT = -20;
    int256 public constant DELTA_HARD_DEFAULT = -50;
    int256 public constant DELTA_CIRCLE_COMPLETE = 25;
    int256 public constant DELTA_STREAK_3M = 15;
    int256 public constant DELTA_STREAK_6M = 30;
    int256 public constant DELTA_STREAK_12M = 50;

    // Decay thresholds
    uint256 public constant DECAY_INACTIVE_30 = 30 days;
    uint256 public constant DECAY_INACTIVE_90 = 90 days;
    uint256 public constant DECAY_INACTIVE_180 = 180 days;

    // Max history stored on-chain
    uint256 public constant MAX_HISTORY = 50;

    // =========================================================================
    // STATE
    // =========================================================================

    struct UserScore {
        uint256 score; // Current score (300–850)
        uint256 joinedAt; // First activity timestamp
        uint256 lastActivity; // Last event timestamp
        uint256 totalContributions; // Sum of all contribution amounts
        uint256 circlesCompleted; // Completed circles count
        uint256 onTimePayments; // On-time payment count
        uint256 softDefaults; // Soft default count
        uint256 hardDefaults; // Hard default count
        uint256 currentStreak; // Consecutive on-time payments
        bool initialized;
    }

    mapping(address => UserScore) private _scores;
    mapping(address => ScoreSnapshot[]) private _history;

    // Storage gap
    uint256[50] private __gap;

    // =========================================================================
    // INITIALIZER
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // =========================================================================
    // EXTERNAL — Write (authorized contracts only)
    // =========================================================================

    /// @inheritdoc ICreditScore
    function recordPayment(address user, CreditEventType ptype, uint256 contributionAmount)
        external
        override
        onlyRole(CIRCLE_ROLE)
    {
        _ensureInitialized(user);
        UserScore storage s = _scores[user];

        int256 delta;
        if (ptype == CreditEventType.ON_TIME_PAYMENT) {
            delta = DELTA_ON_TIME;
            s.onTimePayments++;
            s.currentStreak++;
        } else if (ptype == CreditEventType.EARLY_PAYMENT) {
            delta = DELTA_EARLY;
            s.onTimePayments++;
            s.currentStreak++;
        } else if (ptype == CreditEventType.GRACE_PERIOD_PAYMENT) {
            delta = DELTA_GRACE;
            s.currentStreak = 0; // Grace period resets streak
        } else {
            revert("CreditScore: invalid payment type");
        }

        s.totalContributions += contributionAmount;
        s.lastActivity = block.timestamp;

        _applyDelta(user, delta, ptype);
    }

    /// @inheritdoc ICreditScore
    function recordDefault(address user, bool isHard) external override onlyRole(CIRCLE_ROLE) {
        _ensureInitialized(user);
        UserScore storage s = _scores[user];
        s.currentStreak = 0;
        s.lastActivity = block.timestamp;

        if (isHard) {
            s.hardDefaults++;
            _applyDelta(user, DELTA_HARD_DEFAULT, CreditEventType.HARD_DEFAULT);
        } else {
            s.softDefaults++;
            _applyDelta(user, DELTA_SOFT_DEFAULT, CreditEventType.SOFT_DEFAULT);
        }
    }

    /// @inheritdoc ICreditScore
    function recordCircleCompletion(address user, uint256 circleSize) external override onlyRole(CIRCLE_ROLE) {
        _ensureInitialized(user);
        UserScore storage s = _scores[user];
        s.circlesCompleted++;
        s.lastActivity = block.timestamp;

        // Base completion bonus + size bonus
        int256 delta = DELTA_CIRCLE_COMPLETE + int256(circleSize / 2);
        _applyDelta(user, delta, CreditEventType.CIRCLE_COMPLETION);
    }

    /// @inheritdoc ICreditScore
    function recordStreak(address user, uint256 streakMonths) external override onlyRole(CIRCLE_ROLE) {
        _ensureInitialized(user);

        int256 delta;
        CreditEventType etype;

        if (streakMonths >= 12) {
            delta = DELTA_STREAK_12M;
            etype = CreditEventType.STREAK_12_MONTH;
        } else if (streakMonths >= 6) {
            delta = DELTA_STREAK_6M;
            etype = CreditEventType.STREAK_6_MONTH;
        } else if (streakMonths >= 3) {
            delta = DELTA_STREAK_3M;
            etype = CreditEventType.STREAK_3_MONTH;
        } else {
            return;
        }

        _applyDelta(user, delta, etype);
    }

    /// @inheritdoc ICreditScore
    function applyVouch(address recipient, address voucher, uint256 voucherScore)
        external
        override
        onlyRole(ATTESTATION_ROLE)
    {
        _ensureInitialized(recipient);

        // Vouch weight: 3 pts base, +2 pts if voucher score > 700
        int256 delta = voucherScore >= 700 ? int256(5) : int256(3);

        // Same-circle vouches have reduced weight (handled off-chain via attestation)
        _applyDelta(recipient, delta, CreditEventType.VOUCH_RECEIVED);
        _scores[recipient].lastActivity = block.timestamp;
    }

    /// @inheritdoc ICreditScore
    function applyFraudReport(address user) external override onlyRole(ATTESTATION_ROLE) {
        _ensureInitialized(user);
        _applyDelta(user, -50, CreditEventType.FRAUD_REPORT);
        _scores[user].lastActivity = block.timestamp;
    }

    /// @inheritdoc ICreditScore
    function applyDecay(address user) external override onlyRole(KEEPER_ROLE) {
        if (!_scores[user].initialized) return;

        UserScore storage s = _scores[user];
        uint256 inactiveDays = (block.timestamp - s.lastActivity) / 1 days;

        if (inactiveDays < 30) return; // No decay within 30 days

        uint256 oldScore = s.score;
        uint256 newScore = oldScore;

        if (inactiveDays >= 180) {
            // Decay to 75% + mean reversion toward 500
            newScore = (newScore * 75) / 100;
            // Mean reversion: move 10% toward 500
            if (newScore > INITIAL_SCORE) {
                newScore = newScore - (newScore - INITIAL_SCORE) / 10;
            } else {
                newScore = newScore + (INITIAL_SCORE - newScore) / 10;
            }
        } else if (inactiveDays >= 90) {
            newScore = (newScore * 85) / 100;
        } else if (inactiveDays >= 30) {
            newScore = (newScore * 95) / 100;
        }

        newScore = _clamp(newScore);

        if (newScore != oldScore) {
            s.score = newScore;
            emit InactivityDecayApplied(user, oldScore, newScore, inactiveDays);
        }
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @inheritdoc ICreditScore
    function getScore(address user) external view override returns (uint256) {
        if (!_scores[user].initialized) return INITIAL_SCORE;
        return _scores[user].score;
    }

    /// @inheritdoc ICreditScore
    function getTier(address user) external view override returns (CreditTier) {
        uint256 score = this.getScore(user);
        return _scoreTier(score);
    }

    /// @inheritdoc ICreditScore
    function getScoreComponents(address user) external view override returns (ScoreComponents memory) {
        UserScore storage s = _scores[user];
        if (!s.initialized) {
            return ScoreComponents(0, 0, 0, 0, 0);
        }

        uint256 accountAgeDays = (block.timestamp - s.joinedAt) / 1 days;

        return ScoreComponents({
            paymentHistory: _calcPaymentHistory(s),
            circleCompletion: _calcCircleCompletion(s),
            accountAge: _calcAccountAge(accountAgeDays),
            volumeDiversity: _calcVolumeDiversity(s),
            networkTrust: _calcNetworkTrust(s)
        });
    }

    /// @inheritdoc ICreditScore
    function getScoreHistory(address user, uint256 limit) external view override returns (ScoreSnapshot[] memory) {
        ScoreSnapshot[] storage history = _history[user];
        uint256 len = history.length;
        if (len == 0) return new ScoreSnapshot[](0);

        uint256 count = limit > 0 && limit < len ? limit : len;
        ScoreSnapshot[] memory result = new ScoreSnapshot[](count);

        // Return most recent `count` events
        for (uint256 i = 0; i < count; i++) {
            result[i] = history[len - count + i];
        }
        return result;
    }

    /// @inheritdoc ICreditScore
    function isInitialized(address user) external view override returns (bool) {
        return _scores[user].initialized;
    }

    /// @inheritdoc ICreditScore
    function getLastActivity(address user) external view override returns (uint256) {
        return _scores[user].lastActivity;
    }

    /// @inheritdoc ICreditScore
    function meetsThreshold(address user, uint256 minimumScore) external view override returns (bool) {
        return this.getScore(user) >= minimumScore;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _ensureInitialized(address user) internal {
        if (!_scores[user].initialized) {
            _scores[user] = UserScore({
                score: INITIAL_SCORE,
                joinedAt: block.timestamp,
                lastActivity: block.timestamp,
                totalContributions: 0,
                circlesCompleted: 0,
                onTimePayments: 0,
                softDefaults: 0,
                hardDefaults: 0,
                currentStreak: 0,
                initialized: true
            });
            emit ScoreInitialized(user, INITIAL_SCORE, block.timestamp);
        }
    }

    function _applyDelta(address user, int256 delta, CreditEventType reason) internal {
        UserScore storage s = _scores[user];
        uint256 oldScore = s.score;

        int256 newScore = int256(oldScore) + delta;
        uint256 clamped = _clamp(newScore < 0 ? 0 : uint256(newScore));

        s.score = clamped;

        // Record history (cap at MAX_HISTORY)
        ScoreSnapshot[] storage history = _history[user];
        if (history.length >= MAX_HISTORY) {
            // Shift array (remove oldest)
            for (uint256 i = 0; i < history.length - 1; i++) {
                history[i] = history[i + 1];
            }
            history.pop();
        }
        history.push(
            ScoreSnapshot({
                score: clamped,
                tier: _scoreTier(clamped),
                timestamp: block.timestamp,
                reason: reason,
                delta: delta
            })
        );

        emit ScoreUpdated(user, oldScore, clamped, reason, delta);
    }

    function _clamp(uint256 score) internal pure returns (uint256) {
        if (score < MIN_SCORE) return MIN_SCORE;
        if (score > MAX_SCORE) return MAX_SCORE;
        return score;
    }

    function _scoreTier(uint256 score) internal pure returns (CreditTier) {
        if (score >= 800) return CreditTier.EXCEPTIONAL;
        if (score >= 740) return CreditTier.VERY_GOOD;
        if (score >= 670) return CreditTier.GOOD;
        if (score >= 500) return CreditTier.FAIR;
        return CreditTier.POOR;
    }

    function _calcPaymentHistory(UserScore storage s) internal view returns (uint256) {
        // Max 340 points (40% of 850)
        if (s.onTimePayments == 0 && s.softDefaults == 0 && s.hardDefaults == 0) return 0;
        uint256 total = s.onTimePayments + s.softDefaults + s.hardDefaults;
        uint256 onTimeRate = (s.onTimePayments * 100) / total;
        return (onTimeRate * 340) / 100;
    }

    function _calcCircleCompletion(UserScore storage s) internal view returns (uint256) {
        // 25 pts per circle (max 212 = 8.48 circles)
        uint256 pts = s.circlesCompleted * 25;
        return pts > 212 ? 212 : pts;
    }

    function _calcAccountAge(uint256 ageDays) internal pure returns (uint256) {
        // Max 127 pts: 1 pt/week for first year, then diminishing
        if (ageDays >= 365) return 127;
        return (ageDays * 127) / 365;
    }

    function _calcVolumeDiversity(UserScore storage s) internal view returns (uint256) {
        // Max 85 pts: based on total contributions volume
        // $10K+ = full score
        uint256 volumeUSD = s.totalContributions / 1e6; // Assumes 6 decimals (USDC)
        if (volumeUSD >= 10_000) return 85;
        return (volumeUSD * 85) / 10_000;
    }

    function _calcNetworkTrust(UserScore storage) internal pure returns (uint256) {
        // Computed off-chain via attestations, stored in score delta events
        // Placeholder: returns 0, actual value in score
        return 0;
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
