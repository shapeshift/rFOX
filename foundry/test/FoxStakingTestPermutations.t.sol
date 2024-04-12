// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FoxStakingTestPermutations is Test {
    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;
    address public user = address(0xBEEF);
    uint256 public initialStakeAmount = 1000;
    // Keep enough fundus for many many stakes
    uint public allTheFox = initialStakeAmount * 1000;
    string public runeAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);
        foxToken.makeItRain(user, allTheFox);

        vm.startPrank(user);
        foxToken.approve(address(foxStaking), initialStakeAmount);
        vm.stopPrank();
    }

    // - Stake
    // - Unstake
    // - Withdraw
    function testPermutations1() public {
        vm.startPrank(user);
        // Stake 1000 FOX
        foxStaking.stake(initialStakeAmount, runeAddress);

        // Unstake 1000 FOX
        foxStaking.unstake(initialStakeAmount);

        vm.warp(block.timestamp + 28 days);

        // Withdraw after timewarp
        foxStaking.withdraw();

        // User staked some, unstaked all the staked amount, and then withdrew them so their balance is their og one
        assertEq(foxToken.balanceOf(user), allTheFox);

        vm.stopPrank();
    }

    // - Stake
    // - Set Rune Address
    // - Unstake
    // - Withdraw
    function testPermutations2() public {
        string
            memory newRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsw";

        vm.startPrank(user);
        // Stake 1000 FOX
        foxStaking.stake(initialStakeAmount, runeAddress);

        foxStaking.setRuneAddress(newRuneAddress);

        (, , , string memory storedRuneAddress) = foxStaking.stakingInfo(user);
        assertEq(
            storedRuneAddress,
            newRuneAddress,
            "Rune address should be updated"
        );

        // Unstake 1000 FOX
        foxStaking.unstake(initialStakeAmount);

        // Timewarp before withdrawing
        vm.warp(block.timestamp + 28 days);

        foxStaking.withdraw();

        // User staked some, unstaked all the staked amount, and then withdrew them so their balance is their og one
        assertEq(
            foxToken.balanceOf(user),
            allTheFox,
            "User should recoup their original FOX balance"
        );

        vm.stopPrank();
    }

    // - Stake
    // - Pause Staking
    // - Resume Staking
    // - Additional Stake
    // - Unstake
    // - Withdraw
    function testPermutations3() public {
        uint256 additionalStakeAmount = 500;

        vm.startPrank(user);
        // Stake 1000 FOX
        foxStaking.stake(initialStakeAmount, runeAddress);
        vm.stopPrank();

        vm.startPrank(address(this));
        foxStaking.pauseStaking();
        vm.stopPrank();

        vm.startPrank(user);
        // Trying to stake more while paused is obviously a no-op
        vm.expectRevert("Staking is paused");
        foxStaking.stake(additionalStakeAmount, runeAddress);
        vm.stopPrank();

        vm.startPrank(address(this));
        // Now our user can stake again
        foxStaking.unpauseStaking();
        vm.stopPrank();

        vm.startPrank(user);
        // Approve the additional stake amount and stake it
        foxToken.approve(address(foxStaking), additionalStakeAmount);
        foxStaking.stake(additionalStakeAmount, runeAddress);

        (uint256 stakingBalance, , , ) = foxStaking.stakingInfo(user);
        uint256 expectedTotalStake = initialStakeAmount + additionalStakeAmount;
        // User staking balance should be the sume of their two stakes
        assertEq(
            stakingBalance,
            expectedTotalStake,
            "Total staked amount should match expected value"
        );

        // Unstake all
        foxStaking.unstake(expectedTotalStake);

        vm.warp(block.timestamp + 28 days);

        foxStaking.withdraw();

        // After unstaking all and withdrawing, user recoups their og FOX balance
        assertEq(
            foxToken.balanceOf(user),
            allTheFox,
            "User should recover all staked tokens"
        );
        vm.stopPrank();
    }

    // - Set Rune Address
    // - Stake
    // - Unstake
    // - Withdraw
    // - Stake More
    // - Unstake
    // - Withdraw

    function testPermutations4() public {
        string
            memory initialRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsx";
        uint256 unstakeAmount = 500;
        uint256 additionalStakeAmount = 500;

        vm.startPrank(user);
        foxStaking.setRuneAddress(initialRuneAddress);

        // User performs initial staking of 1000 ETH
        foxStaking.stake(initialStakeAmount, initialRuneAddress);

        // User unstakes 500, meaning their staked balance is now 500
        foxStaking.unstake(unstakeAmount);

        // Time travel to allow for cooldown to pass
        vm.warp(block.timestamp + 28 days);
        foxStaking.withdraw();

        foxToken.approve(address(foxStaking), additionalStakeAmount);
        // User staked 500 FOX more after withdrawing 500, so their staked balance is 500 again, and their unstake balance is still 500
        foxStaking.stake(additionalStakeAmount, initialRuneAddress);

        // User unstakes the total amount that should currently be staked i.e the remaining 500, meaning the whole 1000 is unstaked
        foxStaking.unstake(unstakeAmount + additionalStakeAmount);

        // Withdraw back the full balance after time warp
        vm.warp(block.timestamp + 28 days);
        foxStaking.withdraw();

        // Since user withdrew all their staked tokens, they should have their original balance back
        assertEq(
            foxToken.balanceOf(user),
            allTheFox,
            "User should recover all tokens after full withdrawal."
        );
        vm.stopPrank();
    }

    // - Set rune address
    // - Stake
    // - Set rune address
    // - Set rune address
    // - Unstake
    // - Stake
    // - Approve some more FOX because why not
    // - Stake
    // - Withdraw
    function testPermutations5() public {
        string
            memory newRuneAddress1 = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1";
        string
            memory newRuneAddress2 = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs2";

        vm.startPrank(user);
        foxStaking.setRuneAddress(runeAddress);
        // Stake 1000 FOX
        foxStaking.stake(initialStakeAmount, runeAddress);

        foxStaking.setRuneAddress(newRuneAddress1);

        // Time travel to allow for cooldown to pass again
        vm.warp(block.timestamp + 28 days);

        // Unstake half the 1000 FOX i.e 500 FOX
        foxStaking.unstake(initialStakeAmount / 2);

        foxStaking.setRuneAddress(newRuneAddress2);
        // Approve some more FOX (500) for staking and stake it
        foxToken.approve(address(foxStaking), initialStakeAmount / 2);
        foxStaking.stake(initialStakeAmount / 2, newRuneAddress2);

        // Time warp - the unstaked balance should be 500 FOX, meaning their balance will be
        // original balance - 1500 staked FOX + 500 going back to their wallet = 1000 FOX deducted from their og balance
        vm.warp(block.timestamp + 28 days);
        foxStaking.withdraw();

        assertEq(
            foxToken.balanceOf(user),
            allTheFox - initialStakeAmount,
            "User should recover their initial stake/unstaked amount, but not their subsequent stake."
        );
        vm.stopPrank();
    }

    // - Stake
    // - Change cooldown period
    // - Pause and unpause staking
    // - Stake more
    // - Change Rune address
    // - Unstake partially
    // - Pause and unpause withdrawals
    // - Withdraw

    function testPermutations6() public {
        uint256 additionalStakeAmount = 500;
        string
            memory newRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1";
        uint256 newCooldownPeriod = 14 days;

        // User stakes initial amount i.e 1000
        vm.startPrank(user);
        foxStaking.stake(initialStakeAmount, runeAddress);
        vm.stopPrank();

        // Owner changes cooldown period
        vm.startPrank(address(this));
        foxStaking.setCooldownPeriod(newCooldownPeriod);
        vm.stopPrank();

        // Owner pauses and unpauses staking
        vm.startPrank(address(this));
        foxStaking.pauseStaking();
        foxStaking.unpauseStaking();
        vm.stopPrank();

        // User stakes an additional amount i.e 500, staked amount is now 1500
        vm.startPrank(user);
        foxToken.approve(address(foxStaking), additionalStakeAmount);
        foxStaking.stake(additionalStakeAmount, runeAddress);

        // User changes Rune address
        foxStaking.setRuneAddress(newRuneAddress);

        // User unstakes partially i.e 1000 FOX
        foxStaking.unstake(initialStakeAmount);
        vm.stopPrank();

        // Owner pauses and unpauses withdrawals
        vm.startPrank(address(this));
        foxStaking.pauseWithdrawals();
        foxStaking.unpauseWithdrawals();
        vm.stopPrank();

        // User withdraws their partial unstake (1000 FOX) after cooldown period
        vm.startPrank(user);
        vm.warp(block.timestamp + newCooldownPeriod);
        foxStaking.withdraw();
        vm.stopPrank();

        // i.e 1000 FOX originally depositted and withdrawn + 500 FOX additional stake
        // 1000 FOX comes back to the user, but 500 were spent for the original stake
        // so their staked balance is their original balance is deducted by (1000 + 500 - 1000) = 500
        assertEq(
            foxToken.balanceOf(user),
            allTheFox - initialStakeAmount / 2,
            "User should recover their initial unstaked amount, but not their subsequent stake."
        );
    }

    // - Stake
    // - Change Rune Address
    // - Stake More
    // - Pause Staking, Change Cooldown, Unpause
    // - Unstake Part
    // - Change Rune Address Again
    // - Withdraw
    // - Unstake Remaining and Withdraw
    function testPermutations7() public {
        uint256 firstStakeAmount = 500;
        uint256 secondStakeAmount = 300;
        uint256 firstUnstakeAmount = 200;
        uint256 newCooldownPeriod = 21 days;
        string
            memory firstNewRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1";
        string
            memory secondNewRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs2";

        // User stakes an initial amount
        vm.startPrank(user);
        // Infinite approval, this user is a real degen and plays rugsby, who are we to judge them
        foxToken.approve(address(foxStaking), allTheFox);
        foxStaking.stake(firstStakeAmount, runeAddress);
        foxToken.approve(
            address(foxStaking),
            firstStakeAmount + secondStakeAmount
        );

        // Change Rune address the first time
        foxStaking.setRuneAddress(firstNewRuneAddress);

        // Stake more after changing the Rune address
        foxStaking.stake(secondStakeAmount, firstNewRuneAddress);

        // Owner pauses staking, changes cooldown, and then unpauses staking
        vm.startPrank(address(this));
        foxStaking.pauseStaking();
        foxStaking.setCooldownPeriod(newCooldownPeriod);
        foxStaking.unpauseStaking();
        vm.stopPrank();

        // User unstakes part of their total stake
        vm.startPrank(user);
        foxStaking.unstake(firstUnstakeAmount);

        // Change the Rune address again after some interactions
        foxStaking.setRuneAddress(secondNewRuneAddress);

        // Wait for the new cooldown to pass and then withdraw
        vm.warp(block.timestamp + newCooldownPeriod);
        foxStaking.withdraw();

        // Unstake the remaining balance and withdraw again
        foxStaking.unstake(
            firstStakeAmount + secondStakeAmount - firstUnstakeAmount
        );
        vm.warp(block.timestamp + newCooldownPeriod);
        foxStaking.withdraw();

        vm.stopPrank();

        // Check the final user balance to ensure all tokens are accounted for
        uint expectedBalance = allTheFox -
            (firstStakeAmount +
                secondStakeAmount -
                firstUnstakeAmount -
                (firstStakeAmount + secondStakeAmount - firstUnstakeAmount));
        assertEq(
            foxToken.balanceOf(user),
            expectedBalance,
            "User should have all their tokens after multiple interactions."
        );
    }
}
