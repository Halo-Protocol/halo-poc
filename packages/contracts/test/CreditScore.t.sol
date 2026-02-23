// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TestHelpers} from "./helpers/TestHelpers.sol";
import {ICreditScore} from "../src/interfaces/ICreditScore.sol";

contract CreditScoreTest is TestHelpers {
    address internal user;

    function setUp() public {
        _deployAll();
        user = makeAddr("scorer");
    }

    function test_InitialScore() public view {
        assertEq(creditScore.getScore(user), 500); // INITIAL_SCORE
    }

    function test_RecordOnTimePayment_IncreasesScore() public {
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);

        assertEq(creditScore.getScore(user), 510); // 500 + 10
    }

    function test_RecordEarlyPayment_IncreasesMore() public {
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.EARLY_PAYMENT, 100e6);

        assertEq(creditScore.getScore(user), 512); // 500 + 12
    }

    function test_RecordSoftDefault_DecreasesScore() public {
        vm.prank(address(circle));
        creditScore.recordDefault(user, false);

        assertEq(creditScore.getScore(user), 480); // 500 - 20
    }

    function test_RecordHardDefault_DecreasesBig() public {
        vm.prank(address(circle));
        creditScore.recordDefault(user, true);

        assertEq(creditScore.getScore(user), 450); // 500 - 50
    }

    function test_ScoreLowerBound() public {
        // Apply many hard defaults
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(address(circle));
            creditScore.recordDefault(user, true);
        }

        assertGe(creditScore.getScore(user), 300); // Never below 300
    }

    function test_ScoreUpperBound() public {
        // Apply many payments
        for (uint256 i = 0; i < 100; i++) {
            vm.prank(address(circle));
            creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);
        }

        assertLe(creditScore.getScore(user), 850); // Never above 850
    }

    function test_CircleCompletionBonus() public {
        vm.prank(address(circle));
        creditScore.recordCircleCompletion(user, 5);

        // Base 25 pts + size bonus (5/2 = 2)
        assertEq(creditScore.getScore(user), 527);
    }

    function test_StreakBonus_3Month() public {
        vm.prank(address(circle));
        creditScore.recordStreak(user, 3);

        assertEq(creditScore.getScore(user), 515); // 500 + 15
    }

    function test_StreakBonus_12Month() public {
        vm.prank(address(circle));
        creditScore.recordStreak(user, 12);

        assertEq(creditScore.getScore(user), 550); // 500 + 50
    }

    function test_InactivityDecay_30Days() public {
        // Give user some payments first
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);

        uint256 scoreAfterPayment = creditScore.getScore(user);

        // Warp 35 days
        vm.warp(block.timestamp + 35 days);

        vm.prank(admin);
        creditScore.applyDecay(user);

        uint256 scoreAfterDecay = creditScore.getScore(user);
        assertLt(scoreAfterDecay, scoreAfterPayment); // Decayed
    }

    function test_InactivityDecay_180Days_MeanReversion() public {
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);

        vm.warp(block.timestamp + 181 days);
        vm.prank(admin);
        creditScore.applyDecay(user);

        uint256 score = creditScore.getScore(user);
        assertGe(score, 300); // Still above minimum
    }

    function test_NoDecayWithin30Days() public {
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);

        uint256 scoreBefore = creditScore.getScore(user);

        vm.warp(block.timestamp + 20 days);
        vm.prank(admin);
        creditScore.applyDecay(user);

        assertEq(creditScore.getScore(user), scoreBefore); // No change
    }

    function test_GetTier_Poor() public view {
        assertEq(uint8(creditScore.getTier(user)), uint8(ICreditScore.CreditTier.FAIR)); // 500 = FAIR
    }

    function test_GetTier_AfterImprovements() public {
        // Push to GOOD tier (670+)
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(address(circle));
            creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);
        }

        // 500 + 20×10 = 700 = GOOD
        assertEq(uint8(creditScore.getTier(user)), uint8(ICreditScore.CreditTier.GOOD));
    }

    function test_MeetsThreshold() public view {
        assertFalse(creditScore.meetsThreshold(user, 600));
        assertTrue(creditScore.meetsThreshold(user, 499));
        assertTrue(creditScore.meetsThreshold(user, 500));
    }

    function test_ScoreHistory() public {
        vm.prank(address(circle));
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);
        vm.prank(address(circle));
        creditScore.recordDefault(user, false);

        ICreditScore.ScoreSnapshot[] memory history = creditScore.getScoreHistory(user, 10);
        assertEq(history.length, 2);
        assertEq(history[0].delta, 10); // ON_TIME
        assertEq(history[1].delta, -20); // SOFT_DEFAULT
    }

    function test_UnauthorizedCaller_Reverts() public {
        vm.expectRevert();
        vm.prank(user);
        creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);
    }
}
