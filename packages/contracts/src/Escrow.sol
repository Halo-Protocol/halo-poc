// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";

/// @title Escrow — Halo Protocol Escrow Manager
/// @notice Holds member escrow deposits for ROSCA circles.
///         Formula: escrowRequired = contributionAmount × (memberCount - 1)
///         Funds released on completion, forfeited on default.
/// @dev UUPS upgradeable, only Circle contract can call deposit/release/forfeit.
contract Escrow is IEscrow, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // STATE
    // =========================================================================

    /// @dev key = keccak256(circleId, member)
    mapping(bytes32 => uint256) private _balances;
    mapping(bytes32 => address) private _tokens;

    // Storage gap for upgrade safety
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
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // =========================================================================
    // EXTERNAL — Called by Circle contract only
    // =========================================================================

    /// @inheritdoc IEscrow
    function deposit(uint256 circleId, address member, uint256 amount, address token)
        external
        override
        nonReentrant
        whenNotPaused
        onlyRole(CIRCLE_ROLE)
    {
        require(amount > 0, "Escrow: zero amount");
        require(member != address(0), "Escrow: zero address");

        bytes32 key = _key(circleId, member);
        require(_balances[key] == 0, "Escrow: already deposited");

        _balances[key] = amount;
        _tokens[_circleKey(circleId)] = token;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowDeposited(key, member, amount, token);
    }

    /// @inheritdoc IEscrow
    function release(uint256 circleId, address member) external override nonReentrant whenNotPaused onlyRole(CIRCLE_ROLE) {
        bytes32 key = _key(circleId, member);
        uint256 amount = _balances[key];
        require(amount > 0, "Escrow: nothing to release");

        address token = _tokens[_circleKey(circleId)];
        _balances[key] = 0;

        IERC20(token).safeTransfer(member, amount);

        emit EscrowReleased(key, member, amount);
    }

    /// @inheritdoc IEscrow
    function forfeit(uint256 circleId, address member, uint256 amount, address beneficiary)
        external
        override
        nonReentrant
        whenNotPaused
        onlyRole(CIRCLE_ROLE)
    {
        bytes32 key = _key(circleId, member);
        uint256 balance = _balances[key];
        require(balance > 0, "Escrow: no balance");
        require(amount <= balance, "Escrow: amount exceeds balance");
        require(beneficiary != address(0), "Escrow: zero beneficiary");

        address token = _tokens[_circleKey(circleId)];
        _balances[key] = balance - amount;

        IERC20(token).safeTransfer(beneficiary, amount);

        emit EscrowForfeited(key, member, amount, beneficiary);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @inheritdoc IEscrow
    function getBalance(uint256 circleId, address member) external view override returns (uint256) {
        return _balances[_key(circleId, member)];
    }

    /// @inheritdoc IEscrow
    function getToken(uint256 circleId) external view override returns (address) {
        return _tokens[_circleKey(circleId)];
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _key(uint256 circleId, address member) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(circleId, member));
    }

    function _circleKey(uint256 circleId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("circle", circleId));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
