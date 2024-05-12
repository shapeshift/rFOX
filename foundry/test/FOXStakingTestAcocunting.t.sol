// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {StakingInfo} from "../src/StakingInfo.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestStaking is Test {

    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;
    address userOne = address(0xBEEF);
    address userTwo = address(0xDEAD);
    address userThree = address(0xDEADBEEF);
    uint256 amount = 1000;

    string constant runeAddressOne = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1";
    string constant runeAddressTwo = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs2";
    string constant runeAddressThree = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs3";

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);

        // Free FOX tokens for users
        foxToken.makeItRain(userOne, amount);
        foxToken.makeItRain(userTwo, amount);
        foxToken.makeItRain(userThree, amount);
    }

    function testRewardAmountsWithNoUnstakes() public {
        (   
            uint256 stakingBalance,
            uint256 unstakingBalance,
            uint256 earnedRewards,
            uint256 rewardPerTokenPaid,
        ) = foxStaking.stakingInfo(userOne);
        vm.assertEq(earnedRewards, 0, "User should have no earnedRewards");
        vm.assertEq(rewardPerTokenPaid, 0, "User should have no rewardPerTokenPaid");

        uint256 userOneEarned = foxStaking.earned(userOne);
        uint256 userTwoEarned = foxStaking.earned(userTwo);
        uint256 userThreeEarned = foxStaking.earned(userThree);
         
        // everyone should have equal rewards since they all staked the same amount at the same time
        vm.assertEq(userOneEarned, userTwoEarned, "UserOne and UserTwo should have equal rewards");
        vm.assertEq(userTwoEarned, userThreeEarned, "UserTwo and UserThree should have equal rewards");

        // advance time by 1 day
        vm.warp(block.timestamp + 1 days);
        

    }

}