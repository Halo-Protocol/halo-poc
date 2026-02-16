// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ICircle} from "./interfaces/ICircle.sol";
import {ICreditScore} from "./interfaces/ICreditScore.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {IPenaltyEngine} from "./interfaces/IPenaltyEngine.sol";

/// @title Circle — Halo Protocol ROSCA Circle Contract
/// @notice Manages the full lifecycle of a Rotating Savings and Credit Association.
///
/// State Machine:
///   PENDING → FUNDING → ACTIVE → COMPLETED
///                     ↘ DEFAULTED
///          ↘ CANCELLED
///
/// Economic Parameters:
///   - Members: 3–10
///   - Contribution: $10–$10,000 (in token units)
///   - Cycle: 7–30 days
///   - Grace period: 24–72 hours
///   - Escrow: contributionAmount × (memberCount - 1)
///   - Protocol fee: 1% of payouts
///   - Reserve: 0.5% of payouts
contract Circle is ICircle, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // ROLES
    // =========================================================================

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    uint8 public constant MIN_MEMBERS = 3;
    uint8 public constant MAX_MEMBERS = 10;
    uint256 public constant MIN_CONTRIBUTION = 10e6; // $10 in USDC (6 decimals)
    uint256 public constant MAX_CONTRIBUTION = 10_000e6; // $10,000
    uint32 public constant MIN_CYCLE = 7 days;
    uint32 public constant MAX_CYCLE = 30 days;
    uint32 public constant MIN_GRACE = 24 hours;
    uint32 public constant MAX_GRACE = 72 hours;

    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1%
    uint256 public constant RESERVE_FEE_BPS = 50; // 0.5%
    uint256 public constant BPS_BASE = 10_000;

    // =========================================================================
    // STATE
    // =========================================================================

    // External contracts
    ICreditScore public creditScore;
    IEscrow public escrow;
    IPenaltyEngine public penaltyEngine;
    address public treasury;
    address public reserveFund;

    // Circle counter
    uint256 public nextCircleId;

    // Circuit breakers
    uint256 public maxTVL; // Global TVL cap
    uint256 public maxCircleSize; // Max contribution per circle
    uint256 public maxCirclesPerUser; // Max concurrent circles

    struct CircleData {
        CircleParams params;
        CircleStatus status;
        address creator;
        uint256 currentRoundId;
        uint256 startTime;
        address[] members;
        mapping(address => MemberInfo) memberInfo;
        mapping(uint256 => RoundInfo) rounds;
        mapping(uint256 => mapping(address => bool)) contributions; // roundId → member → paid
        uint256 totalEscrowed;
    }

    mapping(uint256 => CircleData) private _circles;
    mapping(address => uint256[]) private _userCircles;
    uint256 public totalValueLocked;

    // Storage gap for upgrades
    uint256[50] private __gap;

    // =========================================================================
    // EVENTS
    // =========================================================================

    event CircleCreated(uint256 indexed circleId, address indexed creator, CircleParams params);
    event TreasuryUpdated(address newTreasury);
    event ReserveFundUpdated(address newReserveFund);
    event CircuitBreakerUpdated(uint256 maxTVL, uint256 maxCircleSize, uint256 maxCirclesPerUser);

    // =========================================================================
    // INITIALIZER
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address _creditScore,
        address _escrow,
        address _penaltyEngine,
        address _treasury,
        address _reserveFund
    ) external initializer {
        require(admin != address(0), "Circle: zero admin");
        require(_creditScore != address(0), "Circle: zero creditScore");
        require(_escrow != address(0), "Circle: zero escrow");
        require(_penaltyEngine != address(0), "Circle: zero penaltyEngine");
        require(_treasury != address(0), "Circle: zero treasury");
        require(_reserveFund != address(0), "Circle: zero reserveFund");

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
        _grantRole(FACTORY_ROLE, admin);

        creditScore = ICreditScore(_creditScore);
        escrow = IEscrow(_escrow);
        penaltyEngine = IPenaltyEngine(_penaltyEngine);
        treasury = _treasury;
        reserveFund = _reserveFund;

        nextCircleId = 1;

        // Phase 1 limits
        maxTVL = 100_000e6; // $100K
        maxCircleSize = 10_000e6; // $10K per circle
        maxCirclesPerUser = 3;
    }

    // =========================================================================
    // CIRCLE CREATION (called by CircleFactory)
    // =========================================================================

    /// @notice Create a new circle
    /// @dev Called by CircleFactory which validates params
    function createCircle(CircleParams calldata params, address creator)
        external
        onlyRole(FACTORY_ROLE)
        whenNotPaused
        returns (uint256 circleId)
    {
        _validateParams(params);
        require(!penaltyEngine.isBlacklisted(creator), "Circle: creator blacklisted");

        circleId = nextCircleId++;
        CircleData storage c = _circles[circleId];
        c.params = params;
        c.status = CircleStatus.PENDING;
        c.creator = creator;

        // Add creator as first member (slot 0)
        c.members.push(creator);
        c.memberInfo[creator] = MemberInfo({
            addr: creator,
            hasDeposited: false,
            isActive: true,
            payoutRound: 0, // Assigned on activation
            paidRounds: 0,
            escrowRemaining: 0
        });
        _userCircles[creator].push(circleId);

        emit CircleCreated(circleId, creator, params);
        emit MemberJoined(circleId, creator, 0);
    }

    // =========================================================================
    // MEMBER JOINS
    // =========================================================================

    /// @inheritdoc ICircle
    function join(uint256 circleId) external override nonReentrant whenNotPaused {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.PENDING, "Circle: not PENDING");
        require(c.members.length < c.params.memberCount, "Circle: full");
        require(!_isMember(c, msg.sender), "Circle: already member");
        require(!penaltyEngine.isBlacklisted(msg.sender), "Circle: blacklisted");

        // Check user circle limit
        require(_activeCircleCount(msg.sender) < maxCirclesPerUser, "Circle: too many circles");

        uint256 slot = c.members.length;
        c.members.push(msg.sender);
        c.memberInfo[msg.sender] = MemberInfo({
            addr: msg.sender,
            hasDeposited: false,
            isActive: true,
            payoutRound: 0,
            paidRounds: 0,
            escrowRemaining: 0
        });
        _userCircles[msg.sender].push(circleId);

        emit MemberJoined(circleId, msg.sender, slot);

        // Move to FUNDING when all members joined
        if (c.members.length == c.params.memberCount) {
            c.status = CircleStatus.FUNDING;
        }
    }

    // =========================================================================
    // ESCROW DEPOSIT
    // =========================================================================

    /// @inheritdoc ICircle
    function depositEscrow(uint256 circleId) external override nonReentrant whenNotPaused {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.FUNDING, "Circle: not FUNDING");
        require(_isMember(c, msg.sender), "Circle: not member");
        require(!c.memberInfo[msg.sender].hasDeposited, "Circle: already deposited");

        uint256 escrowAmount = _escrowRequired(c.params);

        // Check TVL cap
        require(totalValueLocked + escrowAmount <= maxTVL, "Circle: TVL cap reached");

        c.memberInfo[msg.sender].hasDeposited = true;
        c.memberInfo[msg.sender].escrowRemaining = escrowAmount;
        c.totalEscrowed += escrowAmount;
        totalValueLocked += escrowAmount;

        // Transfer escrow from member to this contract (Circle holds all funds)
        IERC20(c.params.token).safeTransferFrom(msg.sender, address(this), escrowAmount);

        emit EscrowDeposited(circleId, msg.sender, escrowAmount);

        // Activate circle when all escrow deposited
        if (_allEscrowDeposited(c)) {
            _activateCircle(circleId, c);
        }
    }

    // =========================================================================
    // CONTRIBUTE
    // =========================================================================

    /// @inheritdoc ICircle
    function contribute(uint256 circleId) external override nonReentrant whenNotPaused {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.ACTIVE, "Circle: not ACTIVE");
        require(_isMember(c, msg.sender), "Circle: not member");
        require(c.memberInfo[msg.sender].isActive, "Circle: member inactive");

        uint256 roundId = c.currentRoundId;
        RoundInfo storage round = c.rounds[roundId];

        require(!c.contributions[roundId][msg.sender], "Circle: already paid");
        require(block.timestamp <= round.graceDeadline, "Circle: deadline passed");

        // Determine if on-time or grace period
        bool onTime = block.timestamp <= round.deadline;

        c.contributions[roundId][msg.sender] = true;
        c.memberInfo[msg.sender].paidRounds++;
        round.totalCollected += c.params.contributionAmount;

        // Transfer contribution
        IERC20(c.params.token).safeTransferFrom(msg.sender, address(this), c.params.contributionAmount);

        // Record score event
        ICreditScore.CreditEventType scoreEvent =
            onTime ? ICreditScore.CreditEventType.ON_TIME_PAYMENT : ICreditScore.CreditEventType.GRACE_PERIOD_PAYMENT;
        creditScore.recordPayment(msg.sender, scoreEvent, c.params.contributionAmount);

        emit ContributionMade(circleId, roundId, msg.sender, c.params.contributionAmount, onTime);
    }

    // =========================================================================
    // CLAIM PAYOUT
    // =========================================================================

    /// @inheritdoc ICircle
    function claimPayout(uint256 circleId) external override nonReentrant whenNotPaused {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.ACTIVE, "Circle: not ACTIVE");

        uint256 roundId = c.currentRoundId;
        RoundInfo storage round = c.rounds[roundId];

        require(round.recipient == msg.sender, "Circle: not recipient");
        require(!round.payoutClaimed, "Circle: already claimed");
        require(_allActiveMembersPaid(c, roundId), "Circle: not all paid");

        round.payoutClaimed = true;

        uint256 totalPot = round.totalCollected;

        // Calculate fees
        uint256 protocolFee = (totalPot * PROTOCOL_FEE_BPS) / BPS_BASE;
        uint256 reserveFee = (totalPot * RESERVE_FEE_BPS) / BPS_BASE;
        uint256 payout = totalPot - protocolFee - reserveFee;

        // Transfer fees
        IERC20(c.params.token).safeTransfer(treasury, protocolFee);
        IERC20(c.params.token).safeTransfer(reserveFund, reserveFee);
        IERC20(c.params.token).safeTransfer(msg.sender, payout);

        emit PayoutClaimed(circleId, roundId, msg.sender, payout);

        // Advance to next round or complete
        _advanceRound(circleId, c);
    }

    // =========================================================================
    // DEFAULT HANDLING
    // =========================================================================

    /// @inheritdoc ICircle
    function triggerDefault(uint256 circleId, address member)
        external
        override
        nonReentrant
        whenNotPaused
        onlyRole(KEEPER_ROLE)
    {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.ACTIVE, "Circle: not ACTIVE");
        require(_isMember(c, member), "Circle: not member");
        require(c.memberInfo[member].isActive, "Circle: member inactive");

        uint256 roundId = c.currentRoundId;
        RoundInfo storage round = c.rounds[roundId];
        require(block.timestamp > round.graceDeadline, "Circle: grace period active");
        require(!c.contributions[roundId][member], "Circle: member paid");

        uint256 escrowBalance = c.memberInfo[member].escrowRemaining;
        uint256 contribution = c.params.contributionAmount;

        if (escrowBalance > contribution) {
            // SOFT DEFAULT: escrow covers payment
            c.memberInfo[member].escrowRemaining -= contribution;
            c.totalEscrowed -= contribution;

            // Route escrow to payout recipient as if contributed
            c.contributions[roundId][member] = true;
            c.memberInfo[member].paidRounds++;
            round.totalCollected += contribution;

            creditScore.recordDefault(member, false);
            penaltyEngine.applySoftDefault(member, circleId);

            emit SoftDefault(circleId, member, contribution, c.memberInfo[member].escrowRemaining);
        } else {
            // HARD DEFAULT: escrow exhausted, remove member
            uint256 remaining = escrowBalance;
            c.memberInfo[member].escrowRemaining = 0;
            c.memberInfo[member].isActive = false;
            totalValueLocked -= remaining;

            if (remaining > 0) {
                // Distribute remaining escrow to current round recipient
                // (handled via round totalCollected)
                round.totalCollected += remaining;
            }

            creditScore.recordDefault(member, true);
            penaltyEngine.applyHardDefault(member, circleId);

            emit HardDefault(circleId, member, remaining);

            // Check if circle can continue
            uint256 activeCount = _activeCount(c);
            if (activeCount < MIN_MEMBERS) {
                c.status = CircleStatus.DEFAULTED;
                emit CircleCancelled(circleId, "Insufficient active members after hard default");
                return;
            }
        }
    }

    // =========================================================================
    // ESCROW WITHDRAWAL
    // =========================================================================

    /// @inheritdoc ICircle
    function withdrawEscrow(uint256 circleId) external override nonReentrant {
        CircleData storage c = _circles[circleId];
        require(c.status == CircleStatus.COMPLETED, "Circle: not COMPLETED");
        require(_isMember(c, msg.sender), "Circle: not member");

        uint256 amount = c.memberInfo[msg.sender].escrowRemaining;
        require(amount > 0, "Circle: no escrow to withdraw");

        c.memberInfo[msg.sender].escrowRemaining = 0;
        totalValueLocked -= amount;

        IERC20(c.params.token).safeTransfer(msg.sender, amount);

        emit EscrowReleased(circleId, msg.sender, amount);
    }

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @inheritdoc ICircle
    function getCircleStatus(uint256 circleId) external view override returns (CircleStatus) {
        return _circles[circleId].status;
    }

    /// @inheritdoc ICircle
    function getCircleParams(uint256 circleId) external view override returns (CircleParams memory) {
        return _circles[circleId].params;
    }

    /// @inheritdoc ICircle
    function getMemberInfo(uint256 circleId, address member) external view override returns (MemberInfo memory) {
        return _circles[circleId].memberInfo[member];
    }

    /// @inheritdoc ICircle
    function getCurrentRound(uint256 circleId) external view override returns (RoundInfo memory) {
        CircleData storage c = _circles[circleId];
        return c.rounds[c.currentRoundId];
    }

    /// @inheritdoc ICircle
    function getRound(uint256 circleId, uint256 roundId) external view override returns (RoundInfo memory) {
        return _circles[circleId].rounds[roundId];
    }

    /// @inheritdoc ICircle
    function getMembers(uint256 circleId) external view override returns (address[] memory) {
        return _circles[circleId].members;
    }

    /// @inheritdoc ICircle
    function getEscrowRequired(uint256 circleId) external view override returns (uint256) {
        return _escrowRequired(_circles[circleId].params);
    }

    /// @inheritdoc ICircle
    function hasContributed(uint256 circleId, uint256 roundId, address member)
        external
        view
        override
        returns (bool)
    {
        return _circles[circleId].contributions[roundId][member];
    }

    function getUserCircles(address user) external view returns (uint256[] memory) {
        return _userCircles[user];
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _validateParams(CircleParams calldata p) internal pure {
        require(p.memberCount >= MIN_MEMBERS && p.memberCount <= MAX_MEMBERS, "Circle: invalid memberCount");
        require(
            p.contributionAmount >= MIN_CONTRIBUTION && p.contributionAmount <= MAX_CONTRIBUTION,
            "Circle: invalid contribution"
        );
        require(
            p.cycleDuration >= uint32(MIN_CYCLE) && p.cycleDuration <= uint32(MAX_CYCLE), "Circle: invalid cycle"
        );
        require(
            p.gracePeriod >= uint32(MIN_GRACE) && p.gracePeriod <= uint32(MAX_GRACE), "Circle: invalid grace"
        );
        require(p.token != address(0), "Circle: zero token");
    }

    function _escrowRequired(CircleParams memory p) internal pure returns (uint256) {
        return p.contributionAmount * (p.memberCount - 1);
    }

    function _isMember(CircleData storage c, address addr) internal view returns (bool) {
        return c.memberInfo[addr].addr == addr;
    }

    function _allEscrowDeposited(CircleData storage c) internal view returns (bool) {
        for (uint256 i = 0; i < c.members.length; i++) {
            if (!c.memberInfo[c.members[i]].hasDeposited) return false;
        }
        return true;
    }

    function _allActiveMembersPaid(CircleData storage c, uint256 roundId) internal view returns (bool) {
        for (uint256 i = 0; i < c.members.length; i++) {
            address m = c.members[i];
            if (c.memberInfo[m].isActive && !c.contributions[roundId][m]) return false;
        }
        return true;
    }

    function _activeCount(CircleData storage c) internal view returns (uint256 count) {
        for (uint256 i = 0; i < c.members.length; i++) {
            if (c.memberInfo[c.members[i]].isActive) count++;
        }
    }

    function _activeCircleCount(address user) internal view returns (uint256 count) {
        uint256[] storage circles = _userCircles[user];
        for (uint256 i = 0; i < circles.length; i++) {
            CircleStatus s = _circles[circles[i]].status;
            if (s == CircleStatus.PENDING || s == CircleStatus.FUNDING || s == CircleStatus.ACTIVE) {
                count++;
            }
        }
    }

    function _activateCircle(uint256 circleId, CircleData storage c) internal {
        c.status = CircleStatus.ACTIVE;
        c.startTime = block.timestamp;
        c.currentRoundId = 1;

        // Assign payout order (randomized via block data — consider VRF for mainnet)
        _assignPayoutOrder(c);

        // Setup first round
        _setupRound(circleId, c, 1);

        emit CircleActivated(circleId, block.timestamp);
    }

    function _assignPayoutOrder(CircleData storage c) internal {
        uint256 n = c.members.length;
        // Simple pseudo-random shuffle (use Chainlink VRF for production randomness)
        for (uint256 i = n - 1; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, i))) % (i + 1);
            (c.members[i], c.members[j]) = (c.members[j], c.members[i]);
        }
        // Assign payout rounds
        for (uint256 i = 0; i < n; i++) {
            c.memberInfo[c.members[i]].payoutRound = i + 1;
        }
    }

    function _setupRound(uint256 circleId, CircleData storage c, uint256 roundId) internal {
        address recipient = c.members[roundId - 1]; // 1-indexed
        c.rounds[roundId] = RoundInfo({
            roundId: roundId,
            recipient: recipient,
            deadline: block.timestamp + c.params.cycleDuration,
            graceDeadline: block.timestamp + c.params.cycleDuration + c.params.gracePeriod,
            totalCollected: 0,
            payoutClaimed: false
        });
    }

    function _advanceRound(uint256 circleId, CircleData storage c) internal {
        uint256 nextRound = c.currentRoundId + 1;

        if (nextRound > c.params.memberCount) {
            // All rounds complete
            c.status = CircleStatus.COMPLETED;

            // Award circle completion bonus to all members
            for (uint256 i = 0; i < c.members.length; i++) {
                address m = c.members[i];
                if (c.memberInfo[m].isActive) {
                    creditScore.recordCircleCompletion(m, c.members.length);
                }
            }

            emit CircleCompleted(circleId, block.timestamp);
        } else {
            c.currentRoundId = nextRound;
            _setupRound(circleId, c, nextRound);
        }
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Circle: zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setReserveFund(address _reserveFund) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_reserveFund != address(0), "Circle: zero address");
        reserveFund = _reserveFund;
        emit ReserveFundUpdated(_reserveFund);
    }

    function setCircuitBreakers(uint256 _maxTVL, uint256 _maxCircleSize, uint256 _maxCirclesPerUser)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        maxTVL = _maxTVL;
        maxCircleSize = _maxCircleSize;
        maxCirclesPerUser = _maxCirclesPerUser;
        emit CircuitBreakerUpdated(_maxTVL, _maxCircleSize, _maxCirclesPerUser);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
