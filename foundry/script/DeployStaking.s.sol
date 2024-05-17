// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {StakingV1} from "../src/StakingV1.sol";

contract DeployStaking is Script {
    address stakingTokenAddress;

    function setUp() public {
        stakingTokenAddress = vm.envAddress("STAKING_TOKEN_ADDRESS");
    }

    function run() public {
        vm.startBroadcast();
        address stakingProxy = Upgrades.deployUUPSProxy(
            "StakingV1.sol",
            abi.encodeCall(StakingV1.initialize, (stakingTokenAddress))
        );
        vm.stopBroadcast();
        console.log("Contract deployed at:", stakingProxy);
    }
}
