// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";

contract PenaltyEngineTest is TestHelpers {
    address user;

    function setUp() public {
        _deployAll();
        user = makeAddr("penaltyUser");
    }

    function test_InitiallyNotBlacklisted() public view {
        assertFalse(penaltyEngine.isBlacklisted(user));
    }

    function test_SoftDefault_NoBlacklist() public {
        vm.prank(address(circle));
        penaltyEngine.applySoftDefault(user, 1);

        assertFalse(penaltyEngine.isBlacklisted(user)); // no blacklist for soft
        (uint256 soft, uint256 hard) = penaltyEngine.getDefaultCount(user);
        assertEq(soft, 1);
        assertEq(hard, 0);
    }

    function test_HardDefault_Blacklists90Days() public {
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);

        assertTrue(penaltyEngine.isBlacklisted(user));
        assertEq(penaltyEngine.getBlacklistExpiry(user), block.timestamp + 90 days);
    }

    function test_BlacklistExpires() public {
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);

        assertTrue(penaltyEngine.isBlacklisted(user));

        vm.warp(block.timestamp + 91 days);
        assertFalse(penaltyEngine.isBlacklisted(user));
    }

    function test_MultipleSoftDefaults() public {
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(address(circle));
            penaltyEngine.applySoftDefault(user, i + 1);
        }

        (uint256 soft, uint256 hard) = penaltyEngine.getDefaultCount(user);
        assertEq(soft, 3);
        assertFalse(penaltyEngine.isBlacklisted(user));
    }

    function test_HardDefault_CountIncreases() public {
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);

        // Expire blacklist, apply another
        vm.warp(block.timestamp + 91 days);
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 2);

        (uint256 soft, uint256 hard) = penaltyEngine.getDefaultCount(user);
        assertEq(hard, 2);
    }

    function test_AdminCanClearBlacklist() public {
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);
        assertTrue(penaltyEngine.isBlacklisted(user));

        vm.prank(admin);
        penaltyEngine.clearBlacklist(user);
        assertFalse(penaltyEngine.isBlacklisted(user));
    }

    function test_UnauthorizedCannotApplyPenalty() public {
        vm.expectRevert();
        vm.prank(user);
        penaltyEngine.applySoftDefault(user, 1);
    }

    function test_BlacklistedUserCannotJoinCircle() public {
        // Apply hard default → blacklist
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);

        // Try to create a circle as blacklisted user
        _mintAndApprove(user, 10_000e6);
        // This should revert when creating circle
        // (factory or circle checks penaltyEngine.isBlacklisted)
        vm.expectRevert("Circle: creator blacklisted");
        vm.prank(user);
        factory.createCircle(_defaultParams(user));
    }

    function test_GetDefaultCount_Fresh() public view {
        (uint256 soft, uint256 hard) = penaltyEngine.getDefaultCount(user);
        assertEq(soft, 0);
        assertEq(hard, 0);
    }

    function test_BlacklistExpiryCorrect() public {
        uint256 before = block.timestamp;
        vm.prank(address(circle));
        penaltyEngine.applyHardDefault(user, 1);

        uint256 expiry = penaltyEngine.getBlacklistExpiry(user);
        assertApproxEqAbs(expiry, before + 90 days, 2);
    }

    function testFuzz_MultiplePenalties(uint8 softCount, uint8 hardCount) public {
        softCount = uint8(bound(softCount, 0, 20));
        hardCount = uint8(bound(hardCount, 0, 5));

        for (uint256 i = 0; i < softCount; i++) {
            vm.prank(address(circle));
            penaltyEngine.applySoftDefault(user, i);
        }

        address anotherUser = makeAddr("another");
        for (uint256 i = 0; i < hardCount; i++) {
            vm.warp(block.timestamp + 91 days);
            vm.prank(address(circle));
            penaltyEngine.applyHardDefault(anotherUser, i);
        }

        (uint256 soft, uint256 hard) = penaltyEngine.getDefaultCount(user);
        assertEq(soft, softCount);

        (,uint256 hardResult) = penaltyEngine.getDefaultCount(anotherUser);
        assertEq(hardResult, hardCount);
    }
}
