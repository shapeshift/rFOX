// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestUnstake is Test {
    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;
    address user = address(0xBEEF);
    address user2 = address(0xDEAD);
    uint256 amount = 1000;

    string constant runeAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);

        // Free FOX tokens for user
        foxToken.makeItRain(user, amount);
        foxToken.makeItRain(user2, amount);
        // https://book.getfoundry.sh/cheatcodes/start-prank
        vm.startPrank(user);
        // Approve FoxStaking contract to spend user's FOX tokens
        foxToken.approve(address(foxStaking), amount);
        // Stake tokens
        foxStaking.stake(amount, runeAddress);

        vm.startPrank(user2);
        // Approve FoxStaking contract to spend user's FOX tokens
        foxToken.approve(address(foxStaking), amount);
        // Stake tokens
        foxStaking.stake(amount, runeAddress);

        vm.stopPrank();
    }

    function testCannotUnstakeWhenUnstakingPaused() public {
        foxStaking.pauseUnstaking();

        vm.startPrank(user);
        vm.expectRevert("Unstaking is paused");
        foxStaking.unstake(amount);
        vm.stopPrank();
    }

    function testCanUnstakeAfterUnpausingUnstaking() public {
        vm.startPrank(user);
        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);
        vm.stopPrank();

        foxStaking.pauseUnstaking();

        vm.startPrank(user);
        vm.expectRevert("Unstaking is paused");
        foxStaking.unstake(amount);
        vm.stopPrank();

        foxStaking.unpauseUnstaking();

        vm.startPrank(user);
        foxStaking.unstake(amount);

        // Check user staking balances reflect the withdrawal request
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 1000);

        vm.stopPrank();
    }

    function testCannotUnstakeWhenContractPaused() public {
        foxStaking.pause();

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(Pausable.EnforcedPause.selector)
        );
        foxStaking.unstake(amount);
        vm.stopPrank();
    }

    function testUnstake_cannotRequestZero() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance, uint256 unstakingBalance, , ,) = foxStaking
            .stakingInfo(user);
        vm.assertEq(stakingBalance + unstakingBalance, 1000);
        vm.assertEq(stakingBalance, 1000);
        vm.assertEq(unstakingBalance, 0);

        // Try to request withdraw 0
        vm.expectRevert("Cannot unstake 0");
        foxStaking.unstake(0);

        // Check user staking balances are unchanged
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            , ,
        ) = foxStaking.stakingInfo(user);

        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testUnstake_cannotRequestMoreThanBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Try to request more than balance
        vm.expectRevert("Unstake amount exceeds staked balance");
        foxStaking.unstake(amount + 1);

        // Check user staking balances are unchanged
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testUnstake_canRequestBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Try to request exact balance
        foxStaking.unstake(amount);

        // Check user staking balances reflect the withdrawal request
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 1000);

        vm.stopPrank();
    }

    function testUnstake_canPartialBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Try to request exact balance
        foxStaking.unstake(800);

        // Check user staking balances reflect the withdrawal request
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 200);
        vm.assertEq(unstakingBalance_after, 800);

        vm.stopPrank();
    }

    // Tests that requesting to withdraw part of the balance, waiting the cooldown period, withdrawing, then requesting the rest of the balance works
    function testUnstake_partialWithdrawThenFullWithdraw() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Request withdraw of 300 FOX
        foxStaking.unstake(300);

        // Ensure attempting to withdraw the 300 FOX reverts
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Check cooldown period is set
        (
            uint256 stakingBalance_one,
            uint256 unstakingBalance_one,
            , ,
        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingRequest(user, 0)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_one, block.timestamp + 28 days);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_one + unstakingBalance_one, 1000);
        vm.assertEq(stakingBalance_one, 700);
        vm.assertEq(unstakingBalance_one, 300);

        // Time warp 28 days
        vm.warp(block.timestamp + 28 days);

        // Withdraw the 300 FOX
        foxStaking.withdraw();

        // Check user staking balances reflect the withdrawal
        (
            uint256 stakingBalance_two,
            uint256 unstakingBalance_two,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_two + unstakingBalance_two, 700);
        vm.assertEq(stakingBalance_two, 700);
        vm.assertEq(unstakingBalance_two, 0);

        // Request withdraw of the remaining 700 FOX
        foxStaking.unstake(700);

        // Check cooldown period is set
        (
            uint256 stakingBalance_three,
            uint256 unstakingBalance_three,
            , ,
        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingRequest(user, 0)
            .cooldownExpiry;
        vm.assertGt(cooldownExpiry_three, block.timestamp);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_three + unstakingBalance_three, 700);
        vm.assertEq(stakingBalance_three, 0);
        vm.assertEq(unstakingBalance_three, 700);

        vm.stopPrank();
    }

    function testUnstake_multipleConcurrentWithdraws() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Request withdraw of 301 FOX
        foxStaking.unstake(301);

        // Ensure attempting to withdraw the 301 FOX reverts
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Check cooldown period is set
        (
            uint256 stakingBalance_one,
            uint256 unstakingBalance_one,
            , ,
        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingRequest(user, 0)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_one, block.timestamp + 28 days);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_one + unstakingBalance_one, 1000);
        vm.assertEq(stakingBalance_one, 699);
        vm.assertEq(unstakingBalance_one, 301);

        // Time warp 2 days
        vm.warp(block.timestamp + 2 days);

        // check that we cannot withdraw any fox yet
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Request withdraw of another 302 FOX
        foxStaking.unstake(302);

        uint256 cooldownExpiry_two = foxStaking
            .getUnstakingRequest(user, 1)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_two, block.timestamp + 28 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_two,
            uint256 unstakingBalance_two,
            , , 
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_two, 301 + 302);
        vm.assertEq(stakingBalance_two, 1000 - 301 - 302);

        // Time warp 2 days
        vm.warp(block.timestamp + 2 days);

        // Request withdraw of another 303 FOX
        foxStaking.unstake(303);

        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingRequest(user, 2)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_three, block.timestamp + 28 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_three,
            uint256 unstakingBalance_three,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_three, 301 + 302 + 303);
        vm.assertEq(stakingBalance_three, 1000 - 301 - 302 - 303);

        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 3);

        // Time warp to first expiry
        vm.warp(cooldownExpiry_one);

        // we should not be able to withdraw 2 or 3 elements (they are not cooled down yet)
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(1);

        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(2);

        uint256 balBefore = foxToken.balanceOf(user);
        // Withdraw the 301 FOX
        foxStaking.withdraw();
        uint256 balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 301);

        // Check user staking balances reflect the withdrawal
        (
            uint256 stakingBalance_four,
            uint256 unstakingBalance_four,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_four, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_four, 302 + 303);

        // check the length of the array is correct
        // and the sums match the staking info
        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 2);
        vm.assertEq(
            foxStaking.getUnstakingRequest(user, 0).unstakingBalance +
                foxStaking.getUnstakingRequest(user, 1).unstakingBalance,
            302 + 303
        );

        // Time warp to second expiry
        vm.warp(cooldownExpiry_two);

        // we should not be able to withdraw 3rd element (it is not cooled down yet)
        // note the index shifts to zero because of how we are deleting the elements
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);

        balBefore = foxToken.balanceOf(user);
        // Withdraw the 302 FOX
        foxStaking.withdraw(1);
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 302);

        // Check user staking balances reflect the withdrawal
        (
            uint256 stakingBalance_five,
            uint256 unstakingBalance_five,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_five, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_five, 303);

        // check the length of the array is correct and the indexes have shifted
        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 1);
        vm.assertEq(
            foxStaking.getUnstakingRequest(user, 0).unstakingBalance,
            303
        );

        // Time warp to third expiry
        vm.warp(cooldownExpiry_three);

        balBefore = foxToken.balanceOf(user);
        // Withdraw the 303 FOX
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 303);

        // Check user staking balances reflect the withdrawal
        (
            uint256 stakingBalance_six,
            uint256 unstakingBalance_six,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_six, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_six, 0);
        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 0);

        vm.stopPrank();
    }

    function testUnstake_multipleConcurrentWithdrawsWithShorterCooldown()
        public
    {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Request withdraw of 301 FOX
        foxStaking.unstake(301);

        // Ensure attempting to withdraw the 301 FOX reverts
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Check cooldown period is set
        (
            uint256 stakingBalance_one,
            uint256 unstakingBalance_one,
            , , 
        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingRequest(user, 0)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_one, block.timestamp + 28 days);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_one + unstakingBalance_one, 1000);
        vm.assertEq(stakingBalance_one, 699);
        vm.assertEq(unstakingBalance_one, 301);

        // change the cooldown to be 2 days
        vm.stopPrank();
        foxStaking.setCooldownPeriod(2 days);

        vm.startPrank(user);

        // Request withdraw of another 302 FOX
        foxStaking.unstake(302);

        uint256 cooldownExpiry_two = foxStaking
            .getUnstakingRequest(user, 1)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_two, block.timestamp + 2 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_two,
            uint256 unstakingBalance_two,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_two, 301 + 302);
        vm.assertEq(stakingBalance_two, 1000 - 301 - 302);

        // Time warp 2 days
        vm.warp(block.timestamp + 2 days);

        // Request withdraw of another 303 FOX
        foxStaking.unstake(303);

        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingRequest(user, 2)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_three, block.timestamp + 2 days);

        // Time warp another two days
        vm.warp(block.timestamp + 2 days);

        // we should now be able to withdraw the last 2 elements but not the first!
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);

        uint256 balBefore = foxToken.balanceOf(user);
        // Withdraw the 302 FOX
        foxStaking.withdraw();
        uint256 balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 302);

        // calling again should withdraw the 303
        balBefore = foxToken.balanceOf(user);
        // Withdraw the 303 FOX
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 303);

        // we should still have the final claim of 301 pending.
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);

        vm.assertEq(
            foxStaking.getUnstakingRequest(user, 0).unstakingBalance,
            301
        );
        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 1);

        vm.warp(block.timestamp + 28 days);
        // calling again should withdraw the 301
        balBefore = foxToken.balanceOf(user);

        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 301);

        vm.stopPrank();
    }

    function testUnstake_multipleConcurrentWithdrawsWithLongerCooldown()
        public
    {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Request withdraw of 301 FOX
        foxStaking.unstake(301);

        // Ensure attempting to withdraw the 301 FOX reverts
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Check cooldown period is set
        (
            uint256 stakingBalance_one,
            uint256 unstakingBalance_one,
            , ,
        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingRequest(user, 0)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_one, block.timestamp + 28 days);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_one + unstakingBalance_one, 1000);
        vm.assertEq(stakingBalance_one, 699);
        vm.assertEq(unstakingBalance_one, 301);

        // change the cooldown to be 56 days
        vm.stopPrank();
        foxStaking.setCooldownPeriod(56 days);

        vm.startPrank(user);

        // Request withdraw of another 302 FOX
        foxStaking.unstake(302);

        uint256 cooldownExpiry_two = foxStaking
            .getUnstakingRequest(user, 1)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_two, block.timestamp + 56 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_two,
            uint256 unstakingBalance_two,
            , ,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_two, 301 + 302);
        vm.assertEq(stakingBalance_two, 1000 - 301 - 302);

        // Time warp 20 days
        vm.warp(block.timestamp + 20 days);

        // Request withdraw of another 303 FOX
        foxStaking.unstake(303);

        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingRequest(user, 2)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_three, block.timestamp + 56 days);

        // Time warp another 8 days
        vm.warp(block.timestamp + 8 days);

        // we should now be able to withdraw the first element but not the last 2!
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(1);
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(2);

        uint256 balBefore = foxToken.balanceOf(user);
        // Withdraw the 301 FOX
        foxStaking.withdraw();
        uint256 balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 301);

        // 2 elements left, neither can be removed
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(1);

        // Time warp another 45 days - should allow to remove the next one, but not the last
        vm.warp(block.timestamp + 45 days);
        
        // calling again should withdraw the 302
        balBefore = foxToken.balanceOf(user);
        // Withdraw the 302 FOX
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 302);

        // we should still have the final claim of 303 pending.
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);

        vm.assertEq(
            foxStaking.getUnstakingRequest(user, 0).unstakingBalance,
            303
        );
        vm.assertEq(foxStaking.getUnstakingRequestCount(user), 1);

        vm.warp(block.timestamp + 28 days);
        // calling again should withdraw the 303
        balBefore = foxToken.balanceOf(user);
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 303);

        vm.stopPrank();
    }

    function testUnstake_outOfOrderWithdraws() public {
        vm.startPrank(user);

        foxStaking.unstake(100);
        foxStaking.unstake(101);
        foxStaking.unstake(102);
        foxStaking.unstake(103);
        foxStaking.unstake(104);

        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Time warp 28 days
        vm.warp(block.timestamp + 28 days);

        uint256 balBefore = foxToken.balanceOf(user);
        // Withdraw the 102 FOX
        foxStaking.withdraw(2);
        uint256 balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 102);

        balBefore = foxToken.balanceOf(user);
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 408);
        vm.stopPrank();
    }

    function testWithdrawReverts() public {
        vm.startPrank(user);
        vm.expectRevert("No unstaking requests found");
        foxStaking.withdraw();

        vm.expectRevert("No unstaking requests found");
        foxStaking.withdraw(5);

        foxStaking.unstake(100);
        foxStaking.unstake(101);
        foxStaking.unstake(102);
        foxStaking.unstake(103);
        foxStaking.unstake(104);

        vm.expectRevert("invalid index");
        foxStaking.withdraw(5);

        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(0);

        vm.warp(block.timestamp + 28 days);

        foxStaking.withdraw(4);
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();

        vm.expectRevert("No unstaking requests found");
        foxStaking.withdraw();

        vm.expectRevert("No unstaking requests found");
        foxStaking.withdraw(5);
    }

    function testUnstake_multpleUsers() public {
        vm.startPrank(user);

        foxStaking.unstake(100);
        foxStaking.unstake(101);
        foxStaking.unstake(102);
        foxStaking.unstake(103);
        foxStaking.unstake(104);

        vm.warp(block.timestamp + 14 days);

        vm.startPrank(user2);

        foxStaking.unstake(50);
        foxStaking.unstake(51);
        foxStaking.unstake(52);
        foxStaking.unstake(53);
        foxStaking.unstake(54);

        vm.warp(block.timestamp + 14 days);

        // user 2 shouldn't be able to claim anything yet
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // user 1 should be able to claim some fox back
        vm.startPrank(user);
        uint256 balBefore = foxToken.balanceOf(user);
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        uint256 balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 409);

        vm.warp(block.timestamp + 14 days);
        vm.startPrank(user2);
        balBefore = foxToken.balanceOf(user2);
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user2);
        vm.assertEq(balAfter - balBefore, 209);

        vm.startPrank(user);
        balBefore = foxToken.balanceOf(user);
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user);
        vm.assertEq(balAfter - balBefore, 101);

        vm.startPrank(user2);
        balBefore = foxToken.balanceOf(user2);
        foxStaking.withdraw();
        balAfter = foxToken.balanceOf(user2);
        vm.assertEq(balAfter - balBefore, 51);
    }
}
