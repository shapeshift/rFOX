// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {StakingV1} from "../src/StakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {StakingTestDeployer} from "./utils/StakingTestDeployer.sol";

contract StakingTestOwnership is Test {
    StakingTestDeployer public deployer;
    StakingV1 public foxStaking;
    MockFOXToken public foxToken;

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new StakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = StakingV1(proxyAddress);
    }

    function testCanGetVersion() public view {
        uint256 version = foxStaking.version();
        assertEq(version, 1);
    }
}
