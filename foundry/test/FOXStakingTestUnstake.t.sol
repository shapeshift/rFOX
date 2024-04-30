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
        // https://book.getfoundry.sh/cheatcodes/start-prank
        vm.startPrank(user);
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

    function testunstake_cannotRequestZero() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance, uint256 unstakingBalance, ) = foxStaking
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

        ) = foxStaking.stakingInfo(user);

        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testunstake_cannotRequestMoreThanBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,

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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testunstake_canRequestBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,

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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 1000);

        vm.stopPrank();
    }

    function testunstake_canPartialBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,

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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 200);
        vm.assertEq(unstakingBalance_after, 800);

        vm.stopPrank();
    }

    // Tests that requesting to withdraw part of the balance, waiting the cooldown period, withdrawing, then requesting the rest of the balance works
    function testunstake_partialWithdrawThenFullWithdraw() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,

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

        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingInfo(user, 0)
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

        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingInfo(user, 0)
            .cooldownExpiry;
        vm.assertGt(cooldownExpiry_three, block.timestamp);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_three + unstakingBalance_three, 700);
        vm.assertEq(stakingBalance_three, 0);
        vm.assertEq(unstakingBalance_three, 700);

        vm.stopPrank();
    }

    function testunstake_multipleConcurrentWithdraws() public {
        vm.startPrank(user);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,

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

        ) = foxStaking.stakingInfo(user);
        uint256 cooldownExpiry_one = foxStaking
            .getUnstakingInfo(user, 0)
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
            .getUnstakingInfo(user, 1)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_two, block.timestamp + 28 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_two,
            uint256 unstakingBalance_two,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_two, 301 + 302);
        vm.assertEq(stakingBalance_two, 1000 - 301 - 302);

        // Time warp 2 days
        vm.warp(block.timestamp + 2 days);

        // Request withdraw of another 303 FOX
        foxStaking.unstake(303);

        uint256 cooldownExpiry_three = foxStaking
            .getUnstakingInfo(user, 2)
            .cooldownExpiry;
        vm.assertEq(cooldownExpiry_three, block.timestamp + 28 days);

        // confirm total amount cooling down is correct
        (
            uint256 stakingBalance_three,
            uint256 unstakingBalance_three,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(unstakingBalance_three, 301 + 302 + 303);
        vm.assertEq(stakingBalance_three, 1000 - 301 - 302 - 303);

        vm.assertEq(foxStaking.getUnstakingInfoCount(user), 3);

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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_four, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_four, 302 + 303);

        // check the length of the array is correct
        // and the sums match the staking info
        vm.assertEq(foxStaking.getUnstakingInfoCount(user), 2);
        vm.assertEq(
            foxStaking.getUnstakingInfo(user, 0).unstakingBalance +
                foxStaking.getUnstakingInfo(user, 1).unstakingBalance,
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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_five, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_five, 303);

        // check the lenght of the array is correct and the indexes have shifted
        vm.assertEq(foxStaking.getUnstakingInfoCount(user), 1);
        vm.assertEq(foxStaking.getUnstakingInfo(user, 0).unstakingBalance, 303);

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

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_six, 1000 - 301 - 302 - 303);
        vm.assertEq(unstakingBalance_six, 0);
        vm.assertEq(foxStaking.getUnstakingInfoCount(user), 0);

        vm.stopPrank();
    }

    function testunstake_multipleConcurrentWithdrawsWithChangedCooldown()
        public
    {}

    function testunstake_outOfOrderWithdraws() public {}
}
