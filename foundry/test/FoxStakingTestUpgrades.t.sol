// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/FoxStaking.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {MockFOXToken} from "./MockFOXToken.sol";

contract FOXStakingTestUpgrades is Test {
    FoxStaking public foxStaking;
    MockFOXToken public foxToken;
    address user = address(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045);

    function setUp() public {
        foxToken = new MockFOXToken();
        address foxStakingProxy = Upgrades.deployUUPSProxy(
            "FoxStaking.sol",
            abi.encodeCall(FoxStaking.initialize, (address(foxToken)))
        );
        foxStaking = FoxStaking(foxStakingProxy);
    }

    function testCanDeploy() public view {
        uint256 expectedVersion = 1;
        assertEq(foxStaking.version(), expectedVersion);
    }
}
