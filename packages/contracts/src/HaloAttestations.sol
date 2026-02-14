// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IHaloAttestations} from "./interfaces/IHaloAttestations.sol";
import {ICreditScore} from "./interfaces/ICreditScore.sol";

/// @title HaloAttestations — Social attestation system for Halo Protocol
/// @notice Enables vouching, warnings, and fraud reports.
///         Vouching requirements: score ≥ 600, ≤5 vouches per 30 days.
///         Vouches from the same circle are weighted at 0.3x (tracked off-chain).
contract HaloAttestations is IHaloAttestations, AccessControlUpgradeable, UUPSUpgradeable {
    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    uint256 public constant MIN_VOUCHER_SCORE = 600;
    uint256 public constant MAX_VOUCHES_PER_30_DAYS = 5;
    uint256 public constant VOUCH_REVOKE_WINDOW = 48 hours;

    // =========================================================================
    // STATE
    // =========================================================================

    ICreditScore public creditScore;

    mapping(bytes32 => Attestation) private _attestations;
    mapping(address => bytes32[]) private _receivedUIDs;
    mapping(address => bytes32[]) private _issuedUIDs;
    mapping(address => uint256[]) private _vouchTimestamps; // For rate limiting

    uint256 private _uidNonce;

    // Storage gap
    uint256[50] private __gap;

    // =========================================================================
    // INITIALIZER
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address _creditScore) external initializer {
        require(admin != address(0), "Attestations: zero admin");
        require(_creditScore != address(0), "Attestations: zero creditScore");

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNANCE_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        creditScore = ICreditScore(_creditScore);
    }

    // =========================================================================
    // VOUCH
    // =========================================================================

    /// @inheritdoc IHaloAttestations
    function vouch(address recipient, bytes calldata data) external override returns (bytes32 uid) {
        require(recipient != address(0), "Attestations: zero recipient");
        require(recipient != msg.sender, "Attestations: self-vouch");

        // Voucher must have score >= 600
        require(creditScore.getScore(msg.sender) >= MIN_VOUCHER_SCORE, "Attestations: score too low");

        // Rate limit: max 5 vouches per 30 days
        require(_recentVouchCount(msg.sender) < MAX_VOUCHES_PER_30_DAYS, "Attestations: vouch limit reached");

        uid = _generateUID(msg.sender, recipient, AttestationType.VOUCH);

        _attestations[uid] = Attestation({
            uid: uid,
            atype: AttestationType.VOUCH,
            attester: msg.sender,
            recipient: recipient,
            timestamp: block.timestamp,
            revoked: false,
            data: data
        });

        _receivedUIDs[recipient].push(uid);
        _issuedUIDs[msg.sender].push(uid);
        _vouchTimestamps[msg.sender].push(block.timestamp);

        // Apply score bonus via CreditScore contract
        uint256 voucherScore = creditScore.getScore(msg.sender);
        creditScore.applyVouch(recipient, msg.sender, voucherScore);

        emit AttestationCreated(uid, AttestationType.VOUCH, msg.sender, recipient, block.timestamp);
    }

    // =========================================================================
    // WARN (Circle organizer only)
    // =========================================================================

    /// @inheritdoc IHaloAttestations
    function warn(address recipient, uint256 circleId, bytes calldata reason)
        external
        override
        onlyRole(CIRCLE_ROLE)
        returns (bytes32 uid)
    {
        require(recipient != address(0), "Attestations: zero recipient");

        uid = _generateUID(msg.sender, recipient, AttestationType.WARN);

        _attestations[uid] = Attestation({
            uid: uid,
            atype: AttestationType.WARN,
            attester: msg.sender,
            recipient: recipient,
            timestamp: block.timestamp,
            revoked: false,
            data: abi.encode(circleId, reason)
        });

        _receivedUIDs[recipient].push(uid);
        _issuedUIDs[msg.sender].push(uid);

        // Apply credit score penalty for formal warning
        creditScore.recordDefault(recipient, false);

        emit AttestationCreated(uid, AttestationType.WARN, msg.sender, recipient, block.timestamp);
    }

    // =========================================================================
    // FRAUD REPORT (Governance only)
    // =========================================================================

    /// @inheritdoc IHaloAttestations
    function reportFraud(address user, bytes calldata evidence)
        external
        override
        onlyRole(GOVERNANCE_ROLE)
        returns (bytes32 uid)
    {
        require(user != address(0), "Attestations: zero user");

        uid = _generateUID(msg.sender, user, AttestationType.FRAUD_REPORT);

        _attestations[uid] = Attestation({
            uid: uid,
            atype: AttestationType.FRAUD_REPORT,
            attester: msg.sender,
            recipient: user,
            timestamp: block.timestamp,
            revoked: false,
            data: evidence
        });

        _receivedUIDs[user].push(uid);
        _issuedUIDs[msg.sender].push(uid);

        // Apply severe score penalty
        creditScore.applyFraudReport(user);

        emit AttestationCreated(uid, AttestationType.FRAUD_REPORT, msg.sender, user, block.timestamp);
    }

    // =========================================================================
    // REVOKE
    // =========================================================================

    /// @inheritdoc IHaloAttestations
    function revoke(bytes32 uid) external override {
        Attestation storage att = _attestations[uid];
        require(att.uid == uid, "Attestations: not found");
        require(!att.revoked, "Attestations: already revoked");
        require(att.attester == msg.sender, "Attestations: not attester");
        require(att.atype == AttestationType.VOUCH, "Attestations: only vouches revocable");
        require(block.timestamp <= att.timestamp + VOUCH_REVOKE_WINDOW, "Attestations: revoke window closed");

        att.revoked = true;
        emit AttestationRevoked(uid, msg.sender, block.timestamp);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @inheritdoc IHaloAttestations
    function getAttestation(bytes32 uid) external view override returns (Attestation memory) {
        return _attestations[uid];
    }

    /// @inheritdoc IHaloAttestations
    function getAttestationsFor(address recipient) external view override returns (bytes32[] memory) {
        return _receivedUIDs[recipient];
    }

    /// @inheritdoc IHaloAttestations
    function getAttestationsBy(address attester) external view override returns (bytes32[] memory) {
        return _issuedUIDs[attester];
    }

    /// @inheritdoc IHaloAttestations
    function recentVouchCount(address attester) external view override returns (uint256) {
        return _recentVouchCount(attester);
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _generateUID(address attester, address recipient, AttestationType atype) internal returns (bytes32) {
        return keccak256(abi.encodePacked(attester, recipient, atype, block.timestamp, ++_uidNonce));
    }

    function _recentVouchCount(address attester) internal view returns (uint256 count) {
        uint256[] storage timestamps = _vouchTimestamps[attester];
        uint256 cutoff = block.timestamp > 30 days ? block.timestamp - 30 days : 0;
        for (uint256 i = timestamps.length; i > 0; i--) {
            if (timestamps[i - 1] >= cutoff) {
                count++;
            } else {
                break; // Timestamps are in order, stop early
            }
        }
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
