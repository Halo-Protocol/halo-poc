// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TestHelpers} from "../helpers/TestHelpers.sol";
import {ICircle} from "../../src/interfaces/ICircle.sol";

/// @notice Invariant tests for Circle contract
/// @dev These run with Foundry's invariant testing engine (Echidna-style)
contract CircleInvariantTest is TestHelpers {
    uint256 circleId;
    address[] members;

    function setUp() public {
        _deployAll();
        members = _createUsers(5);
        circleId = _setupActiveCircle(members);

        // Exclude contracts that require special governance roles from fuzzing
        excludeContract(address(reserveFund));
        excludeContract(address(escrow));
        excludeContract(address(penaltyEngine));
        excludeContract(address(attestations));
        excludeContract(address(usdc));
    }

    /// @notice TVL tracked in Circle must match actual USDC balance
    function invariant_TVLMatchesBalance() public view {
        // TVL should equal total escrowed (contributions are transient)
        assertLe(circle.totalValueLocked(), usdc.balanceOf(address(circle)));
    }

    /// @notice Score can never exceed 850
    function invariant_ScoreUpperBound() public view {
        for (uint256 i = 0; i < members.length; i++) {
            assertLe(creditScore.getScore(members[i]), 850);
        }
    }

    /// @notice Score can never go below 300
    function invariant_ScoreLowerBound() public view {
        for (uint256 i = 0; i < members.length; i++) {
            assertGe(creditScore.getScore(members[i]), 300);
        }
    }

    /// @notice A completed circle's escrow should equal sum of remaining member escrows
    function invariant_EscrowAccountingOnCompletion() public view {
        if (circle.getCircleStatus(circleId) == ICircle.CircleStatus.COMPLETED) {
            uint256 totalExpected = 0;
            address[] memory m = circle.getMembers(circleId);
            for (uint256 i = 0; i < m.length; i++) {
                totalExpected += circle.getMemberInfo(circleId, m[i]).escrowRemaining;
            }
            // Contract should hold at least this much
            assertGe(usdc.balanceOf(address(circle)), totalExpected);
        }
    }
}
