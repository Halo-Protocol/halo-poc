// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IPenaltyEngine — Interface for default penalty management
interface IPenaltyEngine {
    event BlacklistAdded(address indexed user, uint256 expiry, string reason);
    event BlacklistRemoved(address indexed user);
    event PenaltyApplied(address indexed user, uint256 circleId, bool isHard);

    /// @notice Check if an address is currently blacklisted
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Get blacklist expiry timestamp (0 if not blacklisted)
    function getBlacklistExpiry(address user) external view returns (uint256);

    /// @notice Apply soft default penalty (escrow deducted, circle continues)
    function applySoftDefault(address user, uint256 circleId) external;

    /// @notice Apply hard default penalty (escrow exhausted, 90-day blacklist)
    function applyHardDefault(address user, uint256 circleId) external;

    /// @notice Get number of defaults for a user
    function getDefaultCount(address user) external view returns (uint256 soft, uint256 hard);
}
