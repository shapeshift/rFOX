// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";

contract DeployFoxStaking is Script {
    address foxTokenAddress;

    function setUp() public {
        foxTokenAddress = vm.envAddress("FOX_TOKEN_ADDRESS");
    }

    function run() public {
        vm.startBroadcast();
        address foxStakingProxy = Upgrades.deployUUPSProxy(
            "FoxStakingV1.sol",
            abi.encodeCall(FoxStakingV1.initialize, (foxTokenAddress))
        );
        vm.stopBroadcast();
        console.log("Contract deployed at:", foxStakingProxy);
    }
}
