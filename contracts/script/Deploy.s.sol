// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SortesHouse} from "../src/SortesHouse.sol";
import {SortesMint} from "../src/SortesMint.sol";
import {SortesRenderer} from "../src/SortesRenderer.sol";
import {SortesDice} from "../src/SortesDice.sol";
import {RandomnessProbe} from "../src/attacks/RandomnessProbe.sol";
import {ISortesHouse} from "../src/interfaces/ISortesHouse.sol";

/// @notice Deploys SortesHouse, SortesRenderer and SortesMint with the PRD's testnet parameters.
/// Enrolling the house (anchor + bond + ML-DSA-87 signature) is a separate step:
/// `sortes-house enroll` in house/, because only the daemon holds the ML-DSA key.
///
///   forge script script/Deploy.s.sol --rpc-url diana --broadcast --private-key $DEPLOYER_KEY
///
/// The sender needs an open EVM window that allows contract creation (an unscoped window:
/// scoped windows refuse creation).
contract Deploy is Script {
    function run() external {
        address houseAccount = vm.envOr("SORTES_HOUSE_ACCOUNT", msg.sender);
        address payout = vm.envOr("SORTES_PAYOUT", houseAccount);
        address mintOwner = vm.envOr("SORTES_MINT_OWNER", msg.sender);

        vm.startBroadcast();
        SortesHouse house = new SortesHouse({
            house_: houseAccount,
            payout_: payout,
            lockDelay: 2,
            wHouse: 100,
            wUser: 150,
            maxSkip: 32,
            fee: 1 ether,
            penalty: 2 ether,
            minBond: 200 ether
        });
        SortesRenderer renderer = new SortesRenderer();
        SortesMint mint = new SortesMint(ISortesHouse(address(house)), renderer, 1000, 3, mintOwner);
        SortesDice dice = new SortesDice(ISortesHouse(address(house)), 10 ether, mintOwner);
        RandomnessProbe probe = new RandomnessProbe();
        vm.stopBroadcast();

        console2.log("SortesHouse   ", address(house));
        console2.log("SortesRenderer", address(renderer));
        console2.log("SortesMint    ", address(mint));
        console2.log("SortesDice    ", address(dice));
        console2.log("Probe         ", address(probe));
    }
}
