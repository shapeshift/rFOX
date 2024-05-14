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
    uint256 amount = 500 * 1e18; // 500 FOX tokens with 18 decimals

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
        vm.assertNotEq(
            foxStaking.earned(userOne),
            userOneEarned,
            "UserOne should have earned more rewards"
        );
        vm.assertNotEq(
            foxStaking.earned(userTwo),
            userTwoEarned,
            "UserTwo should have earned more rewards"
        );
        vm.assertNotEq(
            foxStaking.earned(userThree),
            userThreeEarned,
            "UserThree should have earned more rewards"
        );

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

        // userTwo and userThree should have earned rewards for 4 days
        vm.assertNotEq(
            foxStaking.earned(userTwo),
            userTwoEarned,
            "UserTwo should have earned more rewards"
        );
        vm.assertNotEq(
            foxStaking.earned(userThree),
            userThreeEarned,
            "UserThree should have earned more rewards"
        );

        uint256 blockTimeStampAtEnd = block.timestamp;
        vm.assertEq(
            blockTimeOfStaked + 4 days,
            blockTimeStampAtEnd,
            "time of staked should be the same as time of unstaked"
        );

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
            (userOneEarned * 5) / 2,
            userTwoEarned,
            "UserOne should have 2/3 of the rewards of UserTwo"
        );
    }

    function testRewardAmountsForPrecision() public {
        // the worse scenario for precision is when we have
        // a large amount of fox tokens staked, a small staker, and very little time passed
        // we should confirm that they still recieve expected rewards when.

        // create mega whale
        uint256 megaWhaleAmount = 900_000_000 * 1e18; // 900 million FOX tokens with 18 decimals
        foxToken.makeItRain(userOne, megaWhaleAmount);

        vm.prank(userOne);
        foxToken.approve(address(foxStaking), megaWhaleAmount);
        vm.prank(userOne);
        foxStaking.stake(megaWhaleAmount, runeAddressOne);

        uint256 smallStakingAmount = 1 * 1e18; // 1 FOX token with 18 decimals
        vm.prank(userTwo);
        foxStaking.stake(smallStakingAmount, runeAddressTwo);

        // advance time by 1 sec
        vm.warp(block.timestamp + 1);
        uint256 userTwoEarned = foxStaking.earned(userTwo);

        // ensure that the small staker rewards aren't rounded down to 0 for a second of staking.
        vm.assertNotEq(userTwoEarned, 0, "UserTwo should have earned rewards");
    }

    function testRewardAmountsForOverflow() public {
        // create mega whale
        uint256 megaWhaleAmount = 900_000_000 * 1e18; // 900 million FOX tokens with 18 decimals
        foxToken.makeItRain(userOne, megaWhaleAmount);

        vm.prank(userOne);
        foxToken.approve(address(foxStaking), megaWhaleAmount);
        vm.prank(userOne);
        foxStaking.stake(megaWhaleAmount, runeAddressOne);

        // advance time by 15 years
        vm.warp(block.timestamp + 365 * 15 days);

        // ensure this does not overflow
        foxStaking.earned(userOne);
    }

    function testRewardAmountsWithUnstakes() public {
        // store userOne's balance before staking
        uint256 userOneBalance = foxToken.balanceOf(userOne);

        // stake 100 FOX tokens for each user
        uint256 stakingAmount = 100 * 1e18; // 100 FOX token with 18 decimals
        vm.prank(userOne);
        foxStaking.stake(stakingAmount, runeAddressOne);
        vm.prank(userTwo);
        foxStaking.stake(stakingAmount, runeAddressTwo);
        vm.prank(userThree);
        foxStaking.stake(stakingAmount, runeAddressThree);

        vm.warp(block.timestamp + 10 days);

        // unstake userOne
        vm.prank(userOne);
        foxStaking.unstake(stakingAmount);

        // userOne should have earned rewards for 10 days, save that amount to check against later
        uint256 userOneEarned = foxStaking.earned(userOne);

        // fast forward so userOne can withdraw
        vm.warp(block.timestamp + 30 days);
        vm.prank(userOne);
        foxStaking.withdraw();

        // confirm userOne has the same balance as the start
        vm.assertEq(
            foxToken.balanceOf(userOne),
            userOneBalance,
            "UserOne should have the same balance as the start"
        );

        // userOne should have no staking balance
        (uint256 stakingBalance, , uint256 earnedRewards, , ) = foxStaking
            .stakingInfo(userOne);
        vm.assertEq(stakingBalance, 0, "UserOne should have no stakingBalance");
        vm.assertEq(
            userOneEarned,
            earnedRewards,
            "UserOne should have the same earnedRewards from when the unstaked"
        );

        // confirm that userTwo and userThree have earned the same and correct amount of rewards
        uint256 userTwoEarned = foxStaking.earned(userTwo);
        uint256 userThreeEarned = foxStaking.earned(userThree);
        vm.assertEq(
            userTwoEarned,
            userThreeEarned,
            "UserTwo and UserThree should have the same rewards"
        );

        // userOne recieved 1/3 of the rewards for 10 days, userTwo and userThree recieved 2/3 of the rewards for 10 days, plus 1/2 the rewards for 30 days
        // so userOne = 10/3rds
        // userTwo = 10/3rds + 30/2nds = 55/3rds
        // userThree = 10/3rds + 30/2nds = 55/3rds
        uint256 expectedUserTwoEarned = (userOneEarned * 55) / 10;
        vm.assertEq(
            userTwoEarned,
            expectedUserTwoEarned,
            "UserTwo should have the correct amount of rewards"
        );

        // now if we have userOne restake, they should recieved the same rewards as userTwo and userThree from now on.
        // dev note: this is also similiar to how we can do the off chain accounting essentially a snapshot at start of epoch, and then at the end of the epoch
        // time warp 10 days and store all balances, like a new epoch
        vm.warp(block.timestamp + 10 days);
        userOneEarned = foxStaking.earned(userOne);
        userTwoEarned = foxStaking.earned(userTwo);
        userThreeEarned = foxStaking.earned(userThree);

        // have userOne stake the same amount again
        vm.prank(userOne);
        foxStaking.stake(stakingAmount, runeAddressOne);

        // time warp 10 days. All users should have recieved the same amount of rewards since the last time we checked
        vm.warp(block.timestamp + 10 days);
        uint256 userOneDelta = foxStaking.earned(userOne) - userOneEarned;
        uint256 userTwoDelta = foxStaking.earned(userTwo) - userTwoEarned;
        uint256 userThreeDelta = foxStaking.earned(userThree) - userThreeEarned;

        vm.assertEq(
            userOneDelta,
            userTwoDelta,
            "UserOne and UserTwo should have the same rewards"
        );
        vm.assertEq(
            userTwoDelta,
            userThreeDelta,
            "UserTwo and UserThree should have the same rewards"
        );
    }

    function testRewardAmountsWithMultipleUnstakes() public {
        // stake 100 FOX tokens for each user
        uint256 stakingAmount = 100 * 1e18; // 100 FOX token with 18 decimals
        vm.prank(userOne);
        foxStaking.stake(stakingAmount, runeAddressOne);
        vm.prank(userTwo);
        foxStaking.stake(stakingAmount, runeAddressTwo);
        vm.prank(userThree);
        foxStaking.stake(stakingAmount, runeAddressThree);

        vm.warp(block.timestamp + 10 days);

        // unstake half of userOne's stake
        vm.prank(userOne);
        foxStaking.unstake(stakingAmount / 2);

        vm.warp(block.timestamp + 10 days);
        vm.prank(userOne);
        foxStaking.unstake(stakingAmount / 2);

        // fast forward so userOne can withdraw one of the unstakes
        vm.warp(block.timestamp + 18 days);
        vm.prank(userOne);
        foxStaking.withdraw();

        // userOne should have no staking balance
        (uint256 stakingBalance, , , , ) = foxStaking.stakingInfo(userOne);
        vm.assertEq(stakingBalance, 0, "UserOne should have no stakingBalance");

        // confirm that userTwo and userThree have earned the same and correct amount of rewards
        uint256 userOneEarned = foxStaking.earned(userOne);
        uint256 userTwoEarned = foxStaking.earned(userTwo);
        uint256 userThreeEarned = foxStaking.earned(userThree);
        vm.assertEq(
            userTwoEarned,
            userThreeEarned,
            "UserTwo and UserThree should have the same rewards"
        );

        // userOne recieved 1/3 of the rewards for 10 days (10/3) and then 1/5 (50/5) for another 10 days
        // 10/3 + 50/5 = 16/3

        // userTwo recieved 1/3 of the rewards for 10 days (10/3) and then 2/5 (200/5) for another 10 days, and finally 1/2 (18/2) for 18 days
        // 10/3 + 20/5 + 18/2 = 49/3
        uint256 expectedUserTwoEarned = (userOneEarned * 49) / 16;
        vm.assertEq(
            userTwoEarned,
            expectedUserTwoEarned,
            "UserTwo should have the correct amount of rewards"
        );
    }
}
