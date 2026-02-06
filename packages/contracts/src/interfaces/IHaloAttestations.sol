// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IHaloAttestations — Interface for Halo social attestation system
interface IHaloAttestations {
    enum AttestationType {
        VOUCH, // Positive: +3 to +5 score points
        CIRCLE_COMPLETE, // Auto: +2 per member
        WARN, // Negative: -10 score points
        FRAUD_REPORT // Severe: -50 score points
    }

    struct Attestation {
        bytes32 uid;
        AttestationType atype;
        address attester;
        address recipient;
        uint256 timestamp;
        bool revoked;
        bytes data; // Encoded extra context
    }

    event AttestationCreated(
        bytes32 indexed uid,
        AttestationType indexed atype,
        address indexed attester,
        address recipient,
        uint256 timestamp
    );
    event AttestationRevoked(bytes32 indexed uid, address indexed revoker, uint256 timestamp);

    /// @notice Issue a vouch for another user (requires score 600+)
    /// @dev Attester must have score >= 600 and ≤5 vouches in last 30 days
    function vouch(address recipient, bytes calldata data) external returns (bytes32 uid);

    /// @notice Issue a warning (only circle organizer for their circle members)
    function warn(address recipient, uint256 circleId, bytes calldata reason) external returns (bytes32 uid);

    /// @notice Submit a fraud report (governance only)
    function reportFraud(address user, bytes calldata evidence) external returns (bytes32 uid);

    /// @notice Revoke own attestation (vouch only, within 48h)
    function revoke(bytes32 uid) external;

    /// @notice Get attestation by UID
    function getAttestation(bytes32 uid) external view returns (Attestation memory);

    /// @notice Get all attestations received by an address
    function getAttestationsFor(address recipient) external view returns (bytes32[] memory);

    /// @notice Get all attestations issued by an address
    function getAttestationsBy(address attester) external view returns (bytes32[] memory);

    /// @notice Count vouches issued by attester in last 30 days
    function recentVouchCount(address attester) external view returns (uint256);
}
