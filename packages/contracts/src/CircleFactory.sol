// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ICircle} from "./interfaces/ICircle.sol";
import {Circle} from "./Circle.sol";

/// @title CircleFactory — Creates and registers Halo Circles
/// @notice Entry point for circle creation. Validates parameters,
///         calls Circle.createCircle() and maintains a registry.
contract CircleFactory is AccessControlUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // STATE
    // =========================================================================

    Circle public circleContract;

    // Allowlist of accepted tokens
    mapping(address => bool) public acceptedTokens;
    address[] public acceptedTokenList;

    // Circle registry: circleId → creator
    mapping(uint256 => address) public circleCreators;
    uint256[] public allCircleIds;

    // Storage gap
    uint256[50] private __gap;

    // =========================================================================
    // EVENTS
    // =========================================================================

    event CircleCreated(uint256 indexed circleId, address indexed creator);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    // =========================================================================
    // INITIALIZER
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _circleContract) external initializer {
        require(admin != address(0), "Factory: zero admin");
        require(_circleContract != address(0), "Factory: zero circle");

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        circleContract = Circle(_circleContract);
    }

    // =========================================================================
    // CIRCLE CREATION
    // =========================================================================

    /// @notice Create a new ROSCA circle
    /// @param params Circle configuration
    /// @return circleId The ID of the created circle
    function createCircle(ICircle.CircleParams calldata params)
        external
        whenNotPaused
        returns (uint256 circleId)
    {
        require(acceptedTokens[params.token], "Factory: token not accepted");

        circleId = circleContract.nextCircleId();
        circleContract.createCircle(params, msg.sender);

        circleCreators[circleId] = msg.sender;
        allCircleIds.push(circleId);

        emit CircleCreated(circleId, msg.sender);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    function getAllCircles() external view returns (uint256[] memory) {
        return allCircleIds;
    }

    function getCircleCount() external view returns (uint256) {
        return allCircleIds.length;
    }

    function getAcceptedTokens() external view returns (address[] memory) {
        return acceptedTokenList;
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function addToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Factory: zero token");
        require(!acceptedTokens[token], "Factory: already added");
        acceptedTokens[token] = true;
        acceptedTokenList.push(token);
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(acceptedTokens[token], "Factory: not found");
        acceptedTokens[token] = false;
        // Remove from list
        for (uint256 i = 0; i < acceptedTokenList.length; i++) {
            if (acceptedTokenList[i] == token) {
                acceptedTokenList[i] = acceptedTokenList[acceptedTokenList.length - 1];
                acceptedTokenList.pop();
                break;
            }
        }
        emit TokenRemoved(token);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
