// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestOwnership is Test {
    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);
    }

    function testCanGetVersion() public view {
        uint256 version = foxStaking.version();
        assertEq(version, 1);
    }
}
