// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Escrow} from "../src/Escrow.sol";
import {PenaltyEngine} from "../src/PenaltyEngine.sol";
import {CreditScore} from "../src/CreditScore.sol";
import {HaloAttestations} from "../src/HaloAttestations.sol";
import {ReserveFund} from "../src/ReserveFund.sol";
import {Circle} from "../src/Circle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

/// @notice Full deployment script for Halo Protocol
/// @dev Deploys all contracts behind UUPS proxies with proper role setup.
///      Uses Foundry's broadcast for on-chain deployment.
contract Deploy is Script {
    // Roles
    bytes32 constant CIRCLE_ROLE = keccak256("CIRCLE_ROLE");
    bytes32 constant ATTESTATION_ROLE = keccak256("ATTESTATION_ROLE");
    bytes32 constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    struct DeployedContracts {
        address escrow;
        address penaltyEngine;
        address creditScore;
        address attestations;
        address reserveFund;
        address circle;
        address circleFactory;
    }

    function run() external returns (DeployedContracts memory deployed) {
        // Load config from environment
        address admin = vm.envAddress("DEPLOYER_ADDRESS");
        address treasury = vm.envOr("TREASURY_ADDRESS", admin);
        address usdc = vm.envAddress("USDC_ADDRESS_SEPOLIA");

        console2.log("Deploying Halo Protocol to chain:", block.chainid);
        console2.log("Admin:", admin);
        console2.log("Treasury:", treasury);

        vm.startBroadcast();

        // 1. Deploy Escrow
        address escrowImpl = address(new Escrow());
        bytes memory escrowInit = abi.encodeCall(Escrow.initialize, (admin));
        deployed.escrow = address(new ERC1967Proxy(escrowImpl, escrowInit));
        console2.log("Escrow:", deployed.escrow);

        // 2. Deploy PenaltyEngine
        address penaltyImpl = address(new PenaltyEngine());
        bytes memory penaltyInit = abi.encodeCall(PenaltyEngine.initialize, (admin));
        deployed.penaltyEngine = address(new ERC1967Proxy(penaltyImpl, penaltyInit));
        console2.log("PenaltyEngine:", deployed.penaltyEngine);

        // 3. Deploy CreditScore
        address scoreImpl = address(new CreditScore());
        bytes memory scoreInit = abi.encodeCall(CreditScore.initialize, (admin));
        deployed.creditScore = address(new ERC1967Proxy(scoreImpl, scoreInit));
        console2.log("CreditScore:", deployed.creditScore);

        // 4. Deploy ReserveFund
        address reserveImpl = address(new ReserveFund());
        bytes memory reserveInit = abi.encodeCall(ReserveFund.initialize, (admin));
        deployed.reserveFund = address(new ERC1967Proxy(reserveImpl, reserveInit));
        console2.log("ReserveFund:", deployed.reserveFund);

        // 5. Deploy HaloAttestations
        address attestImpl = address(new HaloAttestations());
        bytes memory attestInit = abi.encodeCall(HaloAttestations.initialize, (admin, deployed.creditScore));
        deployed.attestations = address(new ERC1967Proxy(attestImpl, attestInit));
        console2.log("HaloAttestations:", deployed.attestations);

        // 6. Deploy Circle
        address circleImpl = address(new Circle());
        bytes memory circleInit = abi.encodeCall(
            Circle.initialize,
            (admin, deployed.creditScore, deployed.escrow, deployed.penaltyEngine, treasury, deployed.reserveFund)
        );
        deployed.circle = address(new ERC1967Proxy(circleImpl, circleInit));
        console2.log("Circle:", deployed.circle);

        // 7. Deploy CircleFactory
        address factoryImpl = address(new CircleFactory());
        bytes memory factoryInit = abi.encodeCall(CircleFactory.initialize, (admin, deployed.circle));
        deployed.circleFactory = address(new ERC1967Proxy(factoryImpl, factoryInit));
        console2.log("CircleFactory:", deployed.circleFactory);

        // 8. Wire up roles
        // Escrow: grant CIRCLE_ROLE to Circle
        Escrow(deployed.escrow).grantRole(CIRCLE_ROLE, deployed.circle);

        // PenaltyEngine: grant CIRCLE_ROLE to Circle
        PenaltyEngine(deployed.penaltyEngine).grantRole(CIRCLE_ROLE, deployed.circle);

        // CreditScore: grant CIRCLE_ROLE to Circle, ATTESTATION_ROLE to Attestations
        CreditScore(deployed.creditScore).grantRole(CIRCLE_ROLE, deployed.circle);
        CreditScore(deployed.creditScore).grantRole(ATTESTATION_ROLE, deployed.attestations);
        CreditScore(deployed.creditScore).grantRole(KEEPER_ROLE, admin); // Keeper = admin initially

        // Circle: grant FACTORY_ROLE to CircleFactory
        Circle(deployed.circle).grantRole(FACTORY_ROLE, deployed.circleFactory);

        // 9. Add USDC to accepted tokens
        CircleFactory(deployed.circleFactory).addToken(usdc);
        console2.log("USDC added:", usdc);

        vm.stopBroadcast();

        // Save deployment to file
        _saveDeployment(deployed, block.chainid);

        console2.log("\n=== DEPLOYMENT COMPLETE ===");
        console2.log("Escrow:", deployed.escrow);
        console2.log("PenaltyEngine:", deployed.penaltyEngine);
        console2.log("CreditScore:", deployed.creditScore);
        console2.log("HaloAttestations:", deployed.attestations);
        console2.log("ReserveFund:", deployed.reserveFund);
        console2.log("Circle:", deployed.circle);
        console2.log("CircleFactory:", deployed.circleFactory);
    }

    function _saveDeployment(DeployedContracts memory deployed, uint256 chainId) internal {
        string memory json = string.concat(
            '{"chainId":',
            vm.toString(chainId),
            ',"escrow":"',
            vm.toString(deployed.escrow),
            '","penaltyEngine":"',
            vm.toString(deployed.penaltyEngine),
            '","creditScore":"',
            vm.toString(deployed.creditScore),
            '","attestations":"',
            vm.toString(deployed.attestations),
            '","reserveFund":"',
            vm.toString(deployed.reserveFund),
            '","circle":"',
            vm.toString(deployed.circle),
            '","circleFactory":"',
            vm.toString(deployed.circleFactory),
            '","deployedAt":',
            vm.toString(block.timestamp),
            "}"
        );

        string memory path = string.concat("deployments/", vm.toString(chainId), ".json");
        vm.writeFile(path, json);
        console2.log("Deployment saved to:", path);
    }
}
