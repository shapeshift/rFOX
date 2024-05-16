// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {StakingV1} from "../src/StakingV1.sol";

contract DeployStaking is Script {
    address foxTokenAddress;

    function setUp() public {
        foxTokenAddress = vm.envAddress("FOX_TOKEN_ADDRESS");
    }

    function run() public {
        vm.startBroadcast();
        address foxStakingProxy = Upgrades.deployUUPSProxy(
            "StakingV1.sol",
            abi.encodeCall(StakingV1.initialize, (foxTokenAddress))
        );
        vm.stopBroadcast();
        console.log("Contract deployed at:", foxStakingProxy);
    }
}
