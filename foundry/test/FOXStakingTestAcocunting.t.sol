// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "forge-std/console.sol";
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
    uint256 amount = 100 * 1e18; // 100 FOX tokens with 18 decimals

    string constant runeAddressOne =
        "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1";
    string constant runeAddressTwo =
        "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs2";
    string constant runeAddressThree =
        "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs3";

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

        // approve staking contract to spend FOX tokens for all users
        vm.prank(userOne);
        foxToken.approve(address(foxStaking), amount);
        vm.prank(userTwo);
        foxToken.approve(address(foxStaking), amount);
        vm.prank(userThree);
        foxToken.approve(address(foxStaking), amount);
        vm.stopPrank();
    }

    function testRewardAmountsWithNoUnstakes() public {
        (
            uint256 stakingBalance,
            ,
            uint256 earnedRewards,
            uint256 rewardPerTokenPaid,

        ) = foxStaking.stakingInfo(userOne);
        vm.assertEq(earnedRewards, 0, "User should have no earnedRewards");
        vm.assertEq(
            rewardPerTokenPaid,
            0,
            "User should have no rewardPerTokenPaid"
        );
        vm.assertEq(stakingBalance, 0, "User should have no stakingBalance");
        vm.assertEq(
            foxStaking.totalStaked(),
            0,
            "Total staked should be 0 before staking"
        );

        // stake small amount to make sure rewards are calculated correctly and with enough precision
        // for small stakers.
        uint256 smallStakingAmount = 1 * 1e18; // 1 FOX token with 18 decimals
        vm.prank(userOne);
        foxStaking.stake(smallStakingAmount, runeAddressOne);
        vm.prank(userTwo);
        foxStaking.stake(smallStakingAmount, runeAddressTwo);
        vm.prank(userThree);
        foxStaking.stake(smallStakingAmount, runeAddressThree);
        uint256 blockTimeOfStaked = block.timestamp;

       

        // right now all of their earned token amounts should be 0
        vm.assertEq(
            foxStaking.earned(userOne),
            0,
            "UserOne should have no earned rewards"
        );
        vm.assertEq(
            foxStaking.earned(userTwo),
            0,
            "UserTwo should have no earned rewards"
        );
        vm.assertEq(
            foxStaking.earned(userThree),
            0,
            "UserThree should have no earned rewards"
        );

        // total staked should be 3 tokens
        vm.assertEq(
            foxStaking.totalStaked(),
            smallStakingAmount * 3,
            "Total staked should be 3 tokens"
        );

        // advance time by 1 day
        vm.warp(block.timestamp + 1 days);

        uint256 userOneEarned = foxStaking.earned(userOne);
        uint256 userTwoEarned = foxStaking.earned(userTwo);
        uint256 userThreeEarned = foxStaking.earned(userThree);

        // everyone should have equal rewards
        userOneEarned = foxStaking.earned(userOne);
        userTwoEarned = foxStaking.earned(userTwo);
        userThreeEarned = foxStaking.earned(userThree);

        vm.assertEq(
            userOneEarned,
            userTwoEarned,
            "UserOne and UserTwo should have equal rewards"
        );
        vm.assertEq(
            userTwoEarned,
            userThreeEarned,
            "UserTwo and UserThree should have equal rewards"
        );

        // advance time by 1 day
        vm.warp(block.timestamp + 1 days);

        // ensure the values have changed since the last time we checked
        vm.assertNotEq(foxStaking.earned(userOne), userOneEarned, "UserOne should have earned more rewards");
        vm.assertNotEq(foxStaking.earned(userTwo), userTwoEarned, "UserTwo should have earned more rewards");
        vm.assertNotEq(foxStaking.earned(userThree), userThreeEarned, "UserThree should have earned more rewards");

        // all users have now been staked for 2 days. Lets remove one of the users and see if the rewards are calculated correctly
        userOneEarned = foxStaking.earned(userOne);
        vm.prank(userOne);
        foxStaking.unstake(smallStakingAmount);
        // unstaking should not change the amount user1 has earned
        vm.assertEq(
            foxStaking.earned(userOne),
            userOneEarned,
            "UserOne should have the same earned rewards after unstaking"
        );

        vm.assertEq(
            foxStaking.totalStaked(),
            smallStakingAmount * 2,
            "Total staked should be 2 tokens"
        );

        // advance time by 2 days
        vm.warp(block.timestamp + 2 days);

        // userOne should not have earned anymore
        vm.assertEq(
            foxStaking.earned(userOne),
            userOneEarned,
            "UserOne should have the same earned rewards after unstaking"
        );

        uint256 blockTimeStampAtEnd = block.timestamp;
        vm.assertEq(blockTimeOfStaked + 4 days, blockTimeStampAtEnd, "time of staked should be the same as time of unstaked");


        // userOne should have earned rewards for 2 days, userTwo and userThree should have earned rewards for 4 days
        // rewards are constant... so userOne accumulated 1/3 per day staked of the daily amount, and then the other two recieved 1/2 the rewards
        // over the subsequent 2 days.
        // userOne Total = 1/3 + 1/3 = 2/3 total
        // userTwo Total = 1/3 + 1/3 + 1/2 + 1/2 = 5/3 total
        // userThree Total = 1/3 + 1/3 + 1/2 + 1/2 = 5/3 total

        userOneEarned = foxStaking.earned(userOne);
        userTwoEarned = foxStaking.earned(userTwo);
        userThreeEarned = foxStaking.earned(userThree);
        
        vm.assertEq(
            userTwoEarned,
            userThreeEarned,
            "UserTwo should have the same rewards as UserThree"
        );

        vm.assertEq(
            userOneEarned * 5 / 2,
            userTwoEarned,
            "UserOne should have 2/3 of the rewards of UserTwo"
        );
    }
}
