// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {IHaloAttestations} from "../src/interfaces/IHaloAttestations.sol";
import {ICreditScore} from "../src/interfaces/ICreditScore.sol";

contract HaloAttestationsTest is TestHelpers {
    address attester;
    address recipient;

    function setUp() public {
        _deployAll();

        attester = makeAddr("attester");
        recipient = makeAddr("recipient");

        // Give attester a 600+ score so they can vouch
        _giveScore(attester, 650);
        _giveScore(recipient, 500);
    }

    // =========================================================================
    // VOUCH
    // =========================================================================

    function test_Vouch_EmitsEvent() public {
        vm.prank(attester);
        vm.expectEmit(false, true, true, false);
        emit IHaloAttestations.AttestationCreated(
            bytes32(0), IHaloAttestations.AttestationType.VOUCH, attester, recipient, block.timestamp
        );
        attestations.vouch(recipient, "");
    }

    function test_Vouch_IncreasesRecipientScore() public {
        uint256 scoreBefore = creditScore.getScore(recipient);

        vm.prank(attester);
        attestations.vouch(recipient, "");

        assertGt(creditScore.getScore(recipient), scoreBefore);
    }

    function test_Vouch_HighScoreAttester_GivesMorePoints() public {
        address richAttester = makeAddr("richAttester");
        _giveScore(richAttester, 720); // >700 → gives +5 instead of +3

        uint256 scoreBefore = creditScore.getScore(recipient);
        vm.prank(richAttester);
        attestations.vouch(recipient, "");

        assertEq(creditScore.getScore(recipient), scoreBefore + 5);
    }

    function test_Vouch_LowScoreAttester_GivesLessPoints() public {
        address poorAttester = makeAddr("poorAttester");
        _giveScore(poorAttester, 620); // <700 → gives +3

        uint256 scoreBefore = creditScore.getScore(recipient);
        vm.prank(poorAttester);
        attestations.vouch(recipient, "");

        assertEq(creditScore.getScore(recipient), scoreBefore + 3);
    }

    function test_Vouch_RequiresMinScore600() public {
        address lowScorer = makeAddr("lowScorer");
        _giveScore(lowScorer, 580);

        vm.expectRevert("Attestations: score too low");
        vm.prank(lowScorer);
        attestations.vouch(recipient, "");
    }

    function test_Vouch_RateLimited_5PerMonth() public {
        // Issue 5 vouches (different recipients)
        for (uint256 i = 0; i < 5; i++) {
            address newRecipient = makeAddr(string(abi.encodePacked("r", i)));
            _giveScore(newRecipient, 500);
            vm.prank(attester);
            attestations.vouch(newRecipient, "");
        }

        // 6th vouch should fail
        address r6 = makeAddr("r6");
        _giveScore(r6, 500);
        vm.expectRevert("Attestations: vouch limit reached");
        vm.prank(attester);
        attestations.vouch(r6, "");
    }

    function test_Vouch_CannotVouchSelf() public {
        vm.expectRevert("Attestations: self-vouch");
        vm.prank(attester);
        attestations.vouch(attester, "");
    }

    function test_Vouch_ReturnUID() public {
        vm.prank(attester);
        bytes32 uid = attestations.vouch(recipient, "");
        assertTrue(uid != bytes32(0));
    }

    // =========================================================================
    // REVOKE
    // =========================================================================

    function test_Revoke_WithinWindow() public {
        vm.prank(attester);
        bytes32 uid = attestations.vouch(recipient, "");

        vm.prank(attester);
        attestations.revoke(uid);

        assertTrue(attestations.getAttestation(uid).revoked);
    }

    function test_Revoke_AfterWindow_Fails() public {
        vm.prank(attester);
        bytes32 uid = attestations.vouch(recipient, "");

        // Advance past 48h revocation window
        vm.warp(block.timestamp + 49 hours);

        vm.expectRevert("Attestations: revoke window closed");
        vm.prank(attester);
        attestations.revoke(uid);
    }

    function test_Revoke_OnlyAttester() public {
        vm.prank(attester);
        bytes32 uid = attestations.vouch(recipient, "");

        vm.expectRevert("Attestations: not attester");
        vm.prank(recipient);
        attestations.revoke(uid);
    }

    // =========================================================================
    // WARN
    // =========================================================================

    function test_Warn_DecreasesScore() public {
        uint256 scoreBefore = creditScore.getScore(recipient);
        address[] memory members = _createUsers(5);
        uint256 circleId = _setupActiveCircle(members);

        // Admin has CIRCLE_ROLE on attestations (circle operators can call warn)
        vm.prank(admin);
        attestations.warn(members[1], circleId, "Late payments");

        assertLt(creditScore.getScore(members[1]), 500);
    }

    // =========================================================================
    // FRAUD REPORT
    // =========================================================================

    function test_FraudReport_RequiresGovernance() public {
        vm.expectRevert();
        vm.prank(attester);
        attestations.reportFraud(recipient, "evidence");
    }

    function test_FraudReport_DecreasesScoreDrastically() public {
        uint256 scoreBefore = creditScore.getScore(recipient);

        vm.prank(admin); // governance role
        attestations.reportFraud(recipient, "evidence");

        uint256 scoreAfter = creditScore.getScore(recipient);
        assertEq(scoreBefore - scoreAfter, 50); // -50 pts
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    function test_GetAttestationsFor() public {
        vm.prank(attester);
        bytes32 uid = attestations.vouch(recipient, "");

        bytes32[] memory uids = attestations.getAttestationsFor(recipient);
        assertEq(uids.length, 1);
        assertEq(uids[0], uid);
    }

    function test_GetAttestationsBy() public {
        address r1 = makeAddr("r1");
        address r2 = makeAddr("r2");
        _giveScore(r1, 500);
        _giveScore(r2, 500);

        vm.prank(attester);
        attestations.vouch(r1, "");
        vm.prank(attester);
        attestations.vouch(r2, "");

        bytes32[] memory uids = attestations.getAttestationsBy(attester);
        assertEq(uids.length, 2);
    }

    function test_RecentVouchCount() public {
        vm.prank(attester);
        attestations.vouch(recipient, "");

        assertEq(attestations.recentVouchCount(attester), 1);

        // After 31 days, count resets
        vm.warp(block.timestamp + 31 days);
        assertEq(attestations.recentVouchCount(attester), 0);
    }
}
