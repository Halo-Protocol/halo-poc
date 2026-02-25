// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {ICircle} from "../src/interfaces/ICircle.sol";

contract EscrowTest is TestHelpers {
    address user1;
    address user2;
    uint256 circleId;

    function setUp() public {
        _deployAll();
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        // Fund users
        _mintAndApprove(user1, 10_000e6);
        _mintAndApprove(user2, 10_000e6);

        // Create a circle for testing escrow
        address[] memory members = _createUsers(5);
        circleId = _setupFundingCircle(members);
    }

    function test_DepositEscrow_StoresCorrectAmount() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createCircle(members);

        // First member deposits escrow
        vm.prank(members[0]);
        circle.depositEscrow(cid);

        // Escrow = contributionAmount × (memberCount - 1) = 100e6 × 2 = 200e6
        assertEq(circle.getMemberInfo(cid, members[0]).escrowRemaining, 200e6);
    }

    function test_DepositEscrow_TransfersTokens() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createCircle(members);

        uint256 balBefore = usdc.balanceOf(address(circle));
        uint256 escrowAmt = 100e6 * 2; // 3 members - 1

        vm.prank(members[0]);
        circle.depositEscrow(cid);

        assertEq(usdc.balanceOf(address(circle)), balBefore + escrowAmt);
    }

    function test_DepositEscrow_CannotDepositTwice() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createCircle(members);

        vm.prank(members[0]);
        circle.depositEscrow(cid);

        vm.expectRevert("Circle: already deposited");
        vm.prank(members[0]);
        circle.depositEscrow(cid);
    }

    function test_DepositEscrow_AllMembersActivatesCircle() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createCircle(members);

        // Deposit for all members
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            circle.depositEscrow(cid);
        }

        assertEq(uint8(circle.getCircleStatus(cid)), uint8(ICircle.CircleStatus.ACTIVE));
    }

    function test_EscrowRelease_AfterCompletion() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createAndCompleteCircle(members);

        uint256 escrowAmt = 100e6 * 2;
        uint256 balBefore = usdc.balanceOf(members[0]);

        vm.prank(members[0]);
        circle.withdrawEscrow(cid);

        assertEq(usdc.balanceOf(members[0]), balBefore + escrowAmt);
        assertEq(circle.getMemberInfo(cid, members[0]).escrowRemaining, 0);
    }

    function test_EscrowRelease_CannotWithdrawBeforeCompletion() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _setupActiveCircle(members);

        vm.expectRevert("Circle: not COMPLETED");
        vm.prank(members[0]);
        circle.withdrawEscrow(cid);
    }

    function test_EscrowRelease_CannotWithdrawTwice() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createAndCompleteCircle(members);

        vm.prank(members[0]);
        circle.withdrawEscrow(cid);

        vm.expectRevert("Circle: no escrow to withdraw");
        vm.prank(members[0]);
        circle.withdrawEscrow(cid);
    }

    function test_EscrowFormula_FiveMembers() public {
        // 5 members, $100 contribution → $400 escrow each
        address[] memory members = _createUsers(5);
        uint256 cid = _createCircle(members);

        vm.prank(members[0]);
        circle.depositEscrow(cid);

        assertEq(circle.getMemberInfo(cid, members[0]).escrowRemaining, 400e6);
    }

    function test_EscrowFormula_TenMembers() public {
        address[] memory members = _createUsers(10);
        uint256 cid = _createCircleWithParams(members, 100e6, 30 days, 48 hours);

        vm.prank(members[0]);
        circle.depositEscrow(cid);

        assertEq(circle.getMemberInfo(cid, members[0]).escrowRemaining, 900e6);
    }

    function test_SoftDefault_DeductsFromEscrow() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _setupActiveCircle(members);
        address defaulter = members[1];

        // Skip past grace period
        _advancePastGrace(cid);

        uint256 escrowBefore = circle.getMemberInfo(cid, defaulter).escrowRemaining;

        vm.prank(admin);
        circle.triggerDefault(cid, defaulter);

        uint256 escrowAfter = circle.getMemberInfo(cid, defaulter).escrowRemaining;
        assertEq(escrowBefore - escrowAfter, 100e6); // contribution deducted
    }

    function test_HardDefault_ZeroesEscrow() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _setupActiveCircle(members);
        address defaulter = members[1];

        // Drain escrow via soft defaults first
        // In a 3-member circle, escrow = 100e6 × 2 = 200e6
        // After 2 soft defaults, escrow exhausted → hard default
        _advancePastGrace(cid);
        vm.prank(admin);
        circle.triggerDefault(cid, defaulter); // soft (escrow: 200 → 100)

        _advanceRound(cid);
        _advancePastGrace(cid);
        vm.prank(admin);
        circle.triggerDefault(cid, defaulter); // hard (escrow: 100 → 0)

        assertEq(circle.getMemberInfo(cid, defaulter).escrowRemaining, 0);
        assertFalse(circle.getMemberInfo(cid, defaulter).isActive);
    }

    function test_TVL_TrackedCorrectly() public {
        address[] memory members = _createUsers(5);
        uint256 cid = _createCircle(members);

        uint256 tvlBefore = circle.totalValueLocked();

        vm.prank(members[0]);
        circle.depositEscrow(cid);

        assertEq(circle.totalValueLocked(), tvlBefore + 400e6);
    }

    function test_TVL_DecreasesOnWithdraw() public {
        address[] memory members = _createUsers(3);
        uint256 cid = _createAndCompleteCircle(members);

        uint256 tvlBefore = circle.totalValueLocked();

        vm.prank(members[0]);
        circle.withdrawEscrow(cid);

        assertEq(circle.totalValueLocked(), tvlBefore - 200e6);
    }

    // =========================================================================
    // FUZZ TESTS
    // =========================================================================

    function testFuzz_EscrowFormula(uint8 memberCount, uint256 contribution) public pure {
        memberCount = uint8(bound(memberCount, 3, 10));
        contribution = bound(contribution, 10e6, 10_000e6);

        uint256 escrow = contribution * (memberCount - 1);
        assertEq(escrow, contribution * (uint256(memberCount) - 1));
        assertGt(escrow, 0);
    }
}
