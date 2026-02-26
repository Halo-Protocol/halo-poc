// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {TestHelpers} from "../helpers/TestHelpers.sol";
import {ICircle} from "../../src/interfaces/ICircle.sol";
import {ICreditScore} from "../../src/interfaces/ICreditScore.sol";

/// @notice End-to-end integration test: complete circle lifecycle
/// @dev Simulates 5 members over 5 rounds with score tracking
contract FullCircleFlowTest is TestHelpers {
    uint256 circleId;
    address[] members;

    function setUp() public {
        _deployAll();
        members = _createUsers(5);
        circleId = _setupActiveCircle(members);
    }

    function test_FullFlow_HappyPath() public {
        uint256[5] memory startScores;
        for (uint256 i = 0; i < 5; i++) {
            startScores[i] = creditScore.getScore(members[i]);
        }

        // Complete 5 rounds
        for (uint256 r = 1; r <= 5; r++) {
            ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
            address recipient = round.recipient;

            // All members contribute (including recipient)
            for (uint256 i = 0; i < 5; i++) {
                vm.prank(members[i]);
                circle.contribute(circleId);
            }

            // Capture balance after contributing but before claiming payout
            uint256 recipientBalanceBefore = usdc.balanceOf(recipient);

            // Recipient claims
            vm.prank(recipient);
            circle.claimPayout(circleId);

            // Verify payout (~$492.50 after 1.5% fees on $500 pot)
            uint256 payout = usdc.balanceOf(recipient) - recipientBalanceBefore;
            assertGt(payout, 490e6);
            assertLt(payout, 500e6);
        }

        // Circle completed
        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.COMPLETED));

        // All scores improved
        for (uint256 i = 0; i < 5; i++) {
            uint256 finalScore = creditScore.getScore(members[i]);
            assertGt(finalScore, startScores[i], "Score should have improved");
            console2.log("Member score improved", startScores[i], finalScore);
        }

        // All withdraw escrow
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(members[i]);
            circle.withdrawEscrow(circleId);
        }

        // TVL should be 0
        assertEq(circle.totalValueLocked(), 0);
    }

    function test_FullFlow_WithOneDefault() public {
        // First round - member[0] defaults
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);

        // 4 members pay on time
        for (uint256 i = 1; i < 5; i++) {
            vm.prank(members[i]);
            circle.contribute(circleId);
        }

        // Member[0] misses payment, advance past grace
        vm.warp(round.graceDeadline + 1);

        uint256 scoreBeforeDefault = creditScore.getScore(members[0]);
        vm.prank(admin);
        circle.triggerDefault(circleId, members[0]);

        // Score decreased
        assertLt(creditScore.getScore(members[0]), scoreBeforeDefault);

        // Circle still active (soft default)
        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.ACTIVE));

        // Recipient can claim (escrow covered the contribution)
        vm.prank(round.recipient);
        circle.claimPayout(circleId);
    }

    function test_FeeDistribution() public {
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 reserveBefore = reserveFund.getBalance(address(usdc));

        // Complete one round
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(members[i]);
            circle.contribute(circleId);
        }
        vm.prank(round.recipient);
        circle.claimPayout(circleId);

        // 1% treasury fee on $500 = $5
        assertEq(usdc.balanceOf(treasury), treasuryBefore + 5e6);
        // 0.5% reserve fee on $500 = $2.50
        // Note: reserve fund receives directly via safeTransfer from Circle
    }
}
