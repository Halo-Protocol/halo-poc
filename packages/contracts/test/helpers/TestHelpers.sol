// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Escrow} from "../../src/Escrow.sol";
import {PenaltyEngine} from "../../src/PenaltyEngine.sol";
import {CreditScore} from "../../src/CreditScore.sol";
import {HaloAttestations} from "../../src/HaloAttestations.sol";
import {ReserveFund} from "../../src/ReserveFund.sol";
import {Circle} from "../../src/Circle.sol";
import {CircleFactory} from "../../src/CircleFactory.sol";
import {ICircle} from "../../src/interfaces/ICircle.sol";
import {ICreditScore} from "../../src/interfaces/ICreditScore.sol";
import {MockERC20} from "./MockERC20.sol";

contract TestHelpers is Test {
    bytes32 constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 constant ATTESTATION_ROLE = keccak256("ATTESTATION_ROLE");
    bytes32 constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal reserve = makeAddr("reserve");

    MockERC20 internal usdc;
    Escrow internal escrow;
    PenaltyEngine internal penaltyEngine;
    CreditScore internal creditScore;
    HaloAttestations internal attestations;
    ReserveFund internal reserveFund;
    Circle internal circle;
    CircleFactory internal factory;

    function _deployAll() internal {
        vm.startPrank(admin);

        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy contracts behind proxies
        address escrowImpl = address(new Escrow());
        escrow = Escrow(address(new ERC1967Proxy(escrowImpl, abi.encodeCall(Escrow.initialize, (admin)))));

        address penaltyImpl = address(new PenaltyEngine());
        penaltyEngine =
            PenaltyEngine(address(new ERC1967Proxy(penaltyImpl, abi.encodeCall(PenaltyEngine.initialize, (admin)))));

        address scoreImpl = address(new CreditScore());
        creditScore =
            CreditScore(address(new ERC1967Proxy(scoreImpl, abi.encodeCall(CreditScore.initialize, (admin)))));

        address reserveImpl = address(new ReserveFund());
        reserveFund =
            ReserveFund(address(new ERC1967Proxy(reserveImpl, abi.encodeCall(ReserveFund.initialize, (admin)))));

        address attestImpl = address(new HaloAttestations());
        attestations = HaloAttestations(
            address(
                new ERC1967Proxy(attestImpl, abi.encodeCall(HaloAttestations.initialize, (admin, address(creditScore))))
            )
        );

        address circleImpl = address(new Circle());
        circle = Circle(
            address(
                new ERC1967Proxy(
                    circleImpl,
                    abi.encodeCall(
                        Circle.initialize,
                        (admin, address(creditScore), address(escrow), address(penaltyEngine), treasury, address(reserveFund))
                    )
                )
            )
        );

        address factoryImpl = address(new CircleFactory());
        factory = CircleFactory(
            address(new ERC1967Proxy(factoryImpl, abi.encodeCall(CircleFactory.initialize, (admin, address(circle)))))
        );

        // Wire roles
        escrow.grantRole(CIRCLE_ROLE, address(circle));
        penaltyEngine.grantRole(CIRCLE_ROLE, address(circle));
        creditScore.grantRole(CIRCLE_ROLE, address(circle));
        creditScore.grantRole(CIRCLE_ROLE, address(attestations)); // attestations can record defaults (for warn)
        creditScore.grantRole(CIRCLE_ROLE, admin);                 // admin can set scores in tests
        creditScore.grantRole(ATTESTATION_ROLE, address(attestations));
        creditScore.grantRole(KEEPER_ROLE, admin);
        circle.grantRole(FACTORY_ROLE, address(factory));
        attestations.grantRole(CIRCLE_ROLE, admin);                // admin can call warn in tests

        // Add USDC
        factory.addToken(address(usdc));

        vm.stopPrank();
    }

    // =========================================================================
    // USER HELPERS
    // =========================================================================

    /// @notice Create N users with funded wallets (10K USDC each, max approval)
    function _createUsers(uint256 n) internal returns (address[] memory users) {
        users = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            users[i] = makeAddr(string.concat("user", vm.toString(i)));
            usdc.mint(users[i], 10_000e6);
            vm.prank(users[i]);
            usdc.approve(address(circle), type(uint256).max);
        }
    }

    /// @notice Mint USDC to a user and approve the Circle contract
    function _mintAndApprove(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(circle), type(uint256).max);
    }

    // =========================================================================
    // SCORE HELPERS
    // =========================================================================

    /// @notice Set a user's credit score to approximately targetScore via recordPayment calls
    /// @dev Only works for targetScore >= 500 (INITIAL_SCORE) in multiples of 10
    function _giveScore(address user, uint256 targetScore) internal {
        if (targetScore <= 500) return; // Already at 500 by default (uninitialized)

        uint256 needed = (targetScore - 500) / 10;
        vm.startPrank(admin);
        for (uint256 i = 0; i < needed; i++) {
            creditScore.recordPayment(user, ICreditScore.CreditEventType.ON_TIME_PAYMENT, 100e6);
        }
        vm.stopPrank();
    }

    // =========================================================================
    // PARAM HELPERS
    // =========================================================================

    /// @notice Default 5-member $100/month circle params
    function _defaultParams() internal view returns (ICircle.CircleParams memory) {
        return ICircle.CircleParams({
            memberCount: 5,
            contributionAmount: 100e6,
            cycleDuration: 30 days,
            gracePeriod: 48 hours,
            token: address(usdc)
        });
    }

    /// @notice Overload accepting an address (ignored) for call-site compatibility
    function _defaultParams(address) internal view returns (ICircle.CircleParams memory) {
        return _defaultParams();
    }

    // =========================================================================
    // CIRCLE CREATION HELPERS
    // =========================================================================

    /// @notice Create a circle with custom params. Members join but do NOT deposit escrow.
    ///         Returns circleId in FUNDING state.
    function _createCircleWithParams(
        address[] memory members,
        uint256 contribution,
        uint256 cycleDuration,
        uint256 gracePeriod
    ) internal returns (uint256 circleId) {
        ICircle.CircleParams memory params = ICircle.CircleParams({
            memberCount: uint8(members.length),
            contributionAmount: contribution,
            cycleDuration: uint32(cycleDuration),
            gracePeriod: uint32(gracePeriod),
            token: address(usdc)
        });

        vm.prank(members[0]);
        circleId = factory.createCircle(params);

        for (uint256 i = 1; i < members.length; i++) {
            vm.prank(members[i]);
            circle.join(circleId);
        }
        // Status: FUNDING (all members joined, no escrow deposited)
    }

    /// @notice Create a circle using default params (100e6, 30d, 48h). Returns circleId in FUNDING state.
    function _createCircle(address[] memory members) internal returns (uint256 circleId) {
        return _createCircleWithParams(members, 100e6, 30 days, 48 hours);
    }

    /// @notice Alias for _createCircle — returns circleId in FUNDING state.
    function _setupFundingCircle(address[] memory members) internal returns (uint256 circleId) {
        return _createCircle(members);
    }

    /// @notice Create circle + have all members join + deposit escrow → ACTIVE state.
    function _setupActiveCircle(address[] memory members) internal returns (uint256 circleId) {
        circleId = _createCircle(members);

        // All deposit escrow → triggers activation when last member deposits
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            circle.depositEscrow(circleId);
        }
        // Status: ACTIVE
    }

    /// @notice Create an active circle, run all rounds to completion, return circleId in COMPLETED state.
    function _createAndCompleteCircle(address[] memory members) internal returns (uint256 circleId) {
        circleId = _setupActiveCircle(members);

        for (uint256 r = 0; r < members.length; r++) {
            ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);

            // All active members contribute
            for (uint256 i = 0; i < members.length; i++) {
                ICircle.MemberInfo memory info = circle.getMemberInfo(circleId, members[i]);
                if (info.isActive) {
                    vm.prank(members[i]);
                    circle.contribute(circleId);
                }
            }

            // Recipient claims payout → advances to next round or completes
            vm.prank(round.recipient);
            circle.claimPayout(circleId);
        }
        // Status: COMPLETED
    }

    // =========================================================================
    // TIME HELPERS
    // =========================================================================

    /// @notice Warp past the current round's grace deadline
    function _advancePastGrace(uint256 circleId) internal {
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        vm.warp(round.graceDeadline + 1);
    }

    /// @notice Complete the current round: have all unpaid active members contribute,
    ///         then have the recipient claim payout. Safe to call after _advancePastGrace.
    function _advanceRound(uint256 circleId) internal {
        ICircle.RoundInfo memory round = circle.getCurrentRound(circleId);
        uint256 savedTime = block.timestamp;

        // If past the contribution deadline, warp back so members can still pay
        if (block.timestamp > round.deadline) {
            vm.warp(round.deadline - 1);
        }

        address[] memory members = circle.getMembers(circleId);
        for (uint256 i = 0; i < members.length; i++) {
            ICircle.MemberInfo memory info = circle.getMemberInfo(circleId, members[i]);
            if (info.isActive && !circle.hasContributed(circleId, round.roundId, members[i])) {
                vm.prank(members[i]);
                circle.contribute(circleId);
            }
        }

        // Restore time before claiming (claimPayout has no time constraint)
        vm.warp(savedTime);

        vm.prank(round.recipient);
        circle.claimPayout(circleId);
    }
}
