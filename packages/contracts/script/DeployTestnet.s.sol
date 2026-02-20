// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Deploy} from "./Deploy.s.sol";

/// @notice Testnet deployment — same as Deploy.s.sol but with testnet env
/// @dev forge script script/DeployTestnet.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC ...
contract DeployTestnet is Deploy {
// Inherits all logic from Deploy.s.sol
// Set USDC_ADDRESS_SEPOLIA=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
}
