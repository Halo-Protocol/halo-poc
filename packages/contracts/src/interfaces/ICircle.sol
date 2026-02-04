// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICircle — Interface for Halo ROSCA Circle contracts
/// @notice Defines the public API for Circle lifecycle management
interface ICircle {
    // =========================================================================
    // ENUMS
    // =========================================================================

    enum CircleStatus {
        PENDING, // Created, waiting for members
        FUNDING, // All members joined, collecting escrow
        ACTIVE, // Escrow complete, rounds running
        COMPLETED, // All rounds finished successfully
        DEFAULTED, // Unrecoverable default occurred
        CANCELLED // Circle cancelled before activation
    }

    enum DefaultType {
        SOFT, // Covered by escrow, circle continues
        HARD // Escrow exhausted, member removed
    }

    // =========================================================================
    // STRUCTS
    // =========================================================================

    struct CircleParams {
        uint8 memberCount; // 3–10
        uint256 contributionAmount; // In token base units (e.g., 100e6 for $100 USDC)
        uint32 cycleDuration; // Seconds per round (7–30 days)
        uint32 gracePeriod; // Seconds after deadline (24–72 hours)
        address token; // ERC20 token (USDC, USDT, DAI)
    }

    struct RoundInfo {
        uint256 roundId;
        address recipient;
        uint256 deadline;
        uint256 graceDeadline;
        uint256 totalCollected;
        bool payoutClaimed;
    }

    struct MemberInfo {
        address addr;
        bool hasDeposited; // Escrow deposited
        bool isActive; // Not defaulted/removed
        uint256 payoutRound; // Which round they receive
        uint256 paidRounds; // How many rounds they've paid
        uint256 escrowRemaining;
    }

    // =========================================================================
    // EVENTS
    // =========================================================================

    event MemberJoined(uint256 indexed circleId, address indexed member, uint256 slot);
    event EscrowDeposited(uint256 indexed circleId, address indexed member, uint256 amount);
    event CircleActivated(uint256 indexed circleId, uint256 startTime);
    event ContributionMade(
        uint256 indexed circleId,
        uint256 indexed roundId,
        address indexed member,
        uint256 amount,
        bool onTime
    );
    event PayoutClaimed(
        uint256 indexed circleId, uint256 indexed roundId, address indexed recipient, uint256 amount
    );
    event SoftDefault(
        uint256 indexed circleId, address indexed member, uint256 escrowDeducted, uint256 escrowRemaining
    );
    event HardDefault(uint256 indexed circleId, address indexed member, uint256 escrowForfeited);
    event EscrowReleased(uint256 indexed circleId, address indexed member, uint256 amount);
    event CircleCompleted(uint256 indexed circleId, uint256 timestamp);
    event CircleCancelled(uint256 indexed circleId, string reason);

    // =========================================================================
    // STATE-CHANGING FUNCTIONS
    // =========================================================================

    /// @notice Join an open circle (PENDING state)
    function join(uint256 circleId) external;

    /// @notice Deposit full escrow to activate circle membership
    /// @dev Must approve token transfer first: amount = contributionAmount × (memberCount - 1)
    function depositEscrow(uint256 circleId) external;

    /// @notice Make contribution for current round
    function contribute(uint256 circleId) external;

    /// @notice Claim payout as the current round's recipient
    function claimPayout(uint256 circleId) external;

    /// @notice Trigger default for a member who missed payment past grace period
    function triggerDefault(uint256 circleId, address member) external;

    /// @notice Withdraw escrow after circle completion
    function withdrawEscrow(uint256 circleId) external;

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    function getCircleStatus(uint256 circleId) external view returns (CircleStatus);
    function getCircleParams(uint256 circleId) external view returns (CircleParams memory);
    function getMemberInfo(uint256 circleId, address member) external view returns (MemberInfo memory);
    function getCurrentRound(uint256 circleId) external view returns (RoundInfo memory);
    function getRound(uint256 circleId, uint256 roundId) external view returns (RoundInfo memory);
    function getMembers(uint256 circleId) external view returns (address[] memory);
    function getEscrowRequired(uint256 circleId) external view returns (uint256);
    function hasContributed(uint256 circleId, uint256 roundId, address member) external view returns (bool);
}
