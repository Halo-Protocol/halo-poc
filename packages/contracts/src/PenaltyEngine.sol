// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IPenaltyEngine} from "./interfaces/IPenaltyEngine.sol";

/// @title PenaltyEngine — Tracks defaults and manages blacklisting
/// @notice Soft defaults: circle continues, escrow covers payment.
///         Hard defaults: escrow exhausted, 90-day blacklist applied.
contract PenaltyEngine is IPenaltyEngine, AccessControlUpgradeable, UUPSUpgradeable {
    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // STATE
    // =========================================================================

    uint256 public constant SOFT_DEFAULT_BLACKLIST = 0; // No blacklist for soft
    uint256 public constant HARD_DEFAULT_BLACKLIST_DURATION = 90 days;

    struct DefaultRecord {
        uint256 softCount;
        uint256 hardCount;
        uint256 blacklistExpiry; // 0 if not blacklisted
    }

    mapping(address => DefaultRecord) private _records;

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
    // EXTERNAL
    // =========================================================================

    /// @inheritdoc IPenaltyEngine
    function applySoftDefault(address user, uint256 circleId) external override onlyRole(CIRCLE_ROLE) {
        _records[user].softCount++;
        emit PenaltyApplied(user, circleId, false);
    }

    /// @inheritdoc IPenaltyEngine
    function applyHardDefault(address user, uint256 circleId) external override onlyRole(CIRCLE_ROLE) {
        DefaultRecord storage record = _records[user];
        record.hardCount++;
        record.blacklistExpiry = block.timestamp + HARD_DEFAULT_BLACKLIST_DURATION;
        emit BlacklistAdded(user, record.blacklistExpiry, "Hard default");
        emit PenaltyApplied(user, circleId, true);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @inheritdoc IPenaltyEngine
    function isBlacklisted(address user) external view override returns (bool) {
        return _records[user].blacklistExpiry > block.timestamp;
    }

    /// @inheritdoc IPenaltyEngine
    function getBlacklistExpiry(address user) external view override returns (uint256) {
        return _records[user].blacklistExpiry;
    }

    /// @inheritdoc IPenaltyEngine
    function getDefaultCount(address user) external view override returns (uint256 soft, uint256 hard) {
        DefaultRecord storage record = _records[user];
        return (record.softCount, record.hardCount);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// @notice Override blacklist (governance only, emergency use)
    function clearBlacklist(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _records[user].blacklistExpiry = 0;
        emit BlacklistRemoved(user);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
