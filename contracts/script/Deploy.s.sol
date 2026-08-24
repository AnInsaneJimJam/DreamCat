// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";

contract Deploy is Script {
    function run() external returns (Registry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry = new Registry();
        vm.stopBroadcast();
    }
}
