// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IEscrow — Interface for Halo Escrow management
interface IEscrow {
    event EscrowDeposited(bytes32 indexed key, address indexed depositor, uint256 amount, address token);
    event EscrowReleased(bytes32 indexed key, address indexed recipient, uint256 amount);
    event EscrowForfeited(bytes32 indexed key, address indexed member, uint256 amount, address beneficiary);

    /// @notice Deposit escrow for a circle member
    /// @param circleId Circle identifier
    /// @param member Member address
    /// @param amount Amount to escrow
    /// @param token ERC20 token address
    function deposit(uint256 circleId, address member, uint256 amount, address token) external;

    /// @notice Release full escrow back to member on circle completion
    function release(uint256 circleId, address member) external;

    /// @notice Forfeit part or all of escrow on default
    /// @param circleId Circle identifier
    /// @param member Defaulting member
    /// @param amount Amount to forfeit
    /// @param beneficiary Where forfeited funds go (payout recipient)
    function forfeit(uint256 circleId, address member, uint256 amount, address beneficiary) external;

    /// @notice Get current escrow balance for member in circle
    function getBalance(uint256 circleId, address member) external view returns (uint256);

    /// @notice Get token used for circle escrow
    function getToken(uint256 circleId) external view returns (address);
}
