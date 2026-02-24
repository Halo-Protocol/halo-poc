// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {ICircle} from "../src/interfaces/ICircle.sol";
import {ICreditScore} from "../src/interfaces/ICreditScore.sol";

contract CircleTest is TestHelpers {
    function setUp() public {
        _deployAll();
    }

    // =========================================================================
    // CIRCLE CREATION
    // =========================================================================

    function test_CreateCircle() public {
        address[] memory members = _createUsers(1);
        ICircle.CircleParams memory params = _defaultParams();

        vm.prank(members[0]);
        uint256 circleId = factory.createCircle(params);

        assertEq(circleId, 1);
        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.PENDING));

        ICircle.CircleParams memory stored = circle.getCircleParams(circleId);
        assertEq(stored.memberCount, 5);
        assertEq(stored.contributionAmount, 100e6);
    }

    function test_CreateCircle_RevertIfBlacklisted() public {
        address[] memory members = _createUsers(1);

        // Blacklist user via penalty engine
        vm.prank(admin);
        penaltyEngine.grantRole(keccak256("CIRCLE_ROLE"), admin);
        vm.prank(admin);
        penaltyEngine.applyHardDefault(members[0], 0);

        vm.expectRevert("Circle: creator blacklisted");
        vm.prank(members[0]);
        factory.createCircle(_defaultParams());
    }

    function test_CreateCircle_InvalidParams() public {
        address[] memory members = _createUsers(1);

        ICircle.CircleParams memory params = _defaultParams();
        params.memberCount = 2; // Below minimum

        vm.expectRevert("Circle: invalid memberCount");
        vm.prank(members[0]);
        factory.createCircle(params);
    }

    // =========================================================================
    // JOINING
    // =========================================================================

    function test_Join_AllMembers() public {
        address[] memory members = _createUsers(5);

        vm.prank(members[0]);
        uint256 circleId = factory.createCircle(_defaultParams());

        for (uint256 i = 1; i < 5; i++) {
            vm.prank(members[i]);
            circle.join(circleId);
        }

        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.FUNDING));
        assertEq(circle.getMembers(circleId).length, 5);
    }

    function test_Join_RevertIfFull() public {
        address[] memory members = _createUsers(6);

        vm.prank(members[0]);
        uint256 circleId = factory.createCircle(_defaultParams());

        for (uint256 i = 1; i < 5; i++) {
            vm.prank(members[i]);
            circle.join(circleId);
        }

        // Circle moved to FUNDING when full, so status check triggers first
        vm.expectRevert("Circle: not PENDING");
        vm.prank(members[5]);
        circle.join(circleId);
    }

    function test_Join_RevertIfAlreadyMember() public {
        address[] memory members = _createUsers(2);

        vm.prank(members[0]);
        uint256 circleId = factory.createCircle(_defaultParams());

        vm.expectRevert("Circle: already member");
        vm.prank(members[0]);
        circle.join(circleId);
    }

    // =========================================================================
    // ESCROW DEPOSIT
    // =========================================================================

    function test_DepositEscrow_MovesToActive() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.ACTIVE));
    }

    function test_DepositEscrow_CorrectAmount() public {
        address[] memory members = _createUsers(5);

        vm.prank(members[0]);
        uint256 circleId = factory.createCircle(_defaultParams());

        for (uint256 i = 1; i < 5; i++) {
            vm.prank(members[i]);
            circle.join(circleId);
        }

        // Escrow = 100 × (5-1) = $400
        uint256 expectedEscrow = 100e6 * 4;
        uint256 balanceBefore = usdc.balanceOf(members[0]);

        vm.prank(members[0]);
        circle.depositEscrow(circleId);

        assertEq(usdc.balanceOf(members[0]), balanceBefore - expectedEscrow);
    }

    // =========================================================================
    // CONTRIBUTIONS
    // =========================================================================

    function test_Contribute_OnTime() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        uint256 scoreBefore = creditScore.getScore(members[0]);

        vm.prank(members[0]);
        circle.contribute(circleId);

        // Score should increase
        assertGt(creditScore.getScore(members[0]), scoreBefore);
    }

    function test_Contribute_AllMembers() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(members[i]);
            circle.contribute(circleId);
        }

        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        assertEq(round.totalCollected, 100e6 * 5);
    }

    function test_Contribute_RevertIfAlreadyPaid() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        vm.prank(members[0]);
        circle.contribute(circleId);

        vm.expectRevert("Circle: already paid");
        vm.prank(members[0]);
        circle.contribute(circleId);
    }

    function test_Contribute_GracePeriod() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);

        // Warp to grace period
        vm.warp(round.deadline + 1 hours);

        uint256 scoreBefore = creditScore.getScore(members[0]);
        vm.prank(members[0]);
        circle.contribute(circleId);

        // Grace period payment gives less points than on-time
        uint256 scoreAfter = creditScore.getScore(members[0]);
        assertGt(scoreAfter, scoreBefore);
        assertLt(scoreAfter - scoreBefore, 10); // Less than on-time (+10)
    }

    function test_Contribute_RevertAfterGracePeriod() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        vm.warp(round.graceDeadline + 1);

        vm.expectRevert("Circle: deadline passed");
        vm.prank(members[0]);
        circle.contribute(circleId);
    }

    // =========================================================================
    // PAYOUT
    // =========================================================================

    function test_ClaimPayout_HappyPath() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        // All members contribute round 1
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(members[i]);
            circle.contribute(circleId);
        }

        // Find round 1 recipient
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        address recipient = round.recipient;

        uint256 balanceBefore = usdc.balanceOf(recipient);

        vm.prank(recipient);
        circle.claimPayout(circleId);

        // Should receive ~$495 (100×5 - 1% fee - 0.5% fee)
        uint256 expectedPayout = (500e6 * 985) / 1000;
        assertEq(usdc.balanceOf(recipient), balanceBefore + expectedPayout);
    }

    function test_ClaimPayout_NotRecipient() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(members[i]);
            circle.contribute(circleId);
        }

        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        address notRecipient;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] != round.recipient) {
                notRecipient = members[i];
                break;
            }
        }

        vm.expectRevert("Circle: not recipient");
        vm.prank(notRecipient);
        circle.claimPayout(circleId);
    }

    // =========================================================================
    // SOFT DEFAULT
    // =========================================================================

    function test_SoftDefault_EscrowCoversPayment() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        address defaulter = members[0];
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);

        // Advance past grace period
        vm.warp(round.graceDeadline + 1);

        uint256 escrowBefore = circle.getMemberInfo(circleId, defaulter).escrowRemaining;
        uint256 scoreBefore = creditScore.getScore(defaulter);

        vm.prank(admin);
        circle.triggerDefault(circleId, defaulter);

        // Escrow reduced by contribution amount
        assertEq(circle.getMemberInfo(circleId, defaulter).escrowRemaining, escrowBefore - 100e6);

        // Score decreased
        assertLt(creditScore.getScore(defaulter), scoreBefore);

        // Circle still active
        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.ACTIVE));
    }

    // =========================================================================
    // FULL CIRCLE LIFECYCLE
    // =========================================================================

    function test_FullCircle_5Members() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        // Complete all 5 rounds
        for (uint256 roundId = 1; roundId <= 5; roundId++) {
            ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);

            // All contribute
            for (uint256 i = 0; i < 5; i++) {
                vm.prank(members[i]);
                circle.contribute(circleId);
            }

            // Recipient claims
            vm.prank(round.recipient);
            circle.claimPayout(circleId);
        }

        assertEq(uint8(circle.getCircleStatus(circleId)), uint8(ICircle.CircleStatus.COMPLETED));

        // All scores should have improved (5 on-time payments + circle completion bonus)
        for (uint256 i = 0; i < 5; i++) {
            assertGt(creditScore.getScore(members[i]), 500); // Started at 500
        }
    }

    function test_EscrowWithdrawal_AfterCompletion() public {
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        // Complete circle
        for (uint256 roundId = 1; roundId <= 5; roundId++) {
            ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
            for (uint256 i = 0; i < 5; i++) {
                vm.prank(members[i]);
                circle.contribute(circleId);
            }
            vm.prank(round.recipient);
            circle.claimPayout(circleId);
        }

        // All members withdraw escrow
        for (uint256 i = 0; i < 5; i++) {
            uint256 balanceBefore = usdc.balanceOf(members[i]);
            vm.prank(members[i]);
            circle.withdrawEscrow(circleId);
            assertGt(usdc.balanceOf(members[i]), balanceBefore);
        }
    }
}
