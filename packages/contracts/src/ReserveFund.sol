// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title ReserveFund — Protocol insurance reserve
/// @notice Accumulates 0.5% of all payouts as an emergency fund.
///         Governed by multisig. Drawdown requires governance approval.
contract ReserveFund is AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    mapping(address => uint256) public reserves; // token → balance

    event ReserveDeposited(address indexed token, uint256 amount);
    event ReserveDrawdown(address indexed token, address indexed recipient, uint256 amount, string reason);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /// @notice Receive reserve contributions (called by Circle on payouts)
    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Reserve: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        reserves[token] += amount;
        emit ReserveDeposited(token, amount);
    }

    /// @notice Emergency drawdown (governance only)
    function drawdown(address token, address recipient, uint256 amount, string calldata reason)
        external
        nonReentrant
        onlyRole(GOVERNANCE_ROLE)
    {
        require(reserves[token] >= amount, "Reserve: insufficient");
        require(recipient != address(0), "Reserve: zero recipient");
        reserves[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit ReserveDrawdown(token, recipient, amount, reason);
    }

    function getBalance(address token) external view returns (uint256) {
        return reserves[token];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
