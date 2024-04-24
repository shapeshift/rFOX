// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestWithdraw is Test {
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
        // Set rune address
        foxStaking.setRuneAddress(runeAddress);
        // Stake tokens
        foxStaking.stake(amount, runeAddress);

        vm.stopPrank();
    }

    function testCannotWithdrawWhenWithdrawalsPaused() public {
        foxStaking.pauseWithdrawals();

        vm.startPrank(user);
        vm.expectRevert("Withdrawals are paused"); // Make sure this matches the actual revert message used in your contract
        foxStaking.withdraw();
        vm.stopPrank();
    }

    function testCannotWithdrawWhenContractPaused() public {
        foxStaking.pause();

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(Pausable.EnforcedPause.selector)
        );
        foxStaking.withdraw();
        vm.stopPrank();
    }

    function testCanWithdrawAfterUnpausingWithdraw() public {
        vm.startPrank(user);
        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);
        // Request withdraw
        foxStaking.unstake(amount);
        vm.stopPrank();

        foxStaking.pauseWithdrawals();

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        vm.startPrank(user);
        vm.expectRevert("Withdrawals are paused");
        foxStaking.withdraw();
        vm.stopPrank();

        foxStaking.unpauseWithdrawals();

        vm.startPrank(user);
        foxStaking.withdraw();

        // Check user staking balances reflect the withdrawal request
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 0);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testWithdraw_cannotWithdrawBeforeCooldown() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.unstake(amount);

        // Fast-forward time by 28 days minus 1 second
        vm.warp(block.timestamp + 28 days - 1 seconds);

        // Try to withdraw before cooldown period ends (they have 1 second to go)
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw();

        // Check user wallet balance of FOX is still 0
        assertEq(foxToken.balanceOf(user), 0);

        vm.stopPrank();
    }

    function testWithdraw_canWithdrawAfterCooldown() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.unstake(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw when the cooldown period ends
        foxStaking.withdraw();

        // Check user received the withdrawn amount of FOX
        assertEq(foxToken.balanceOf(user), amount);

        vm.stopPrank();
    }

    function testWithdraw_cannotWithdrawZero() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Do NOT unstake here - i.e keep funds staked
        // foxStaking.unstake(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw 0
        vm.expectRevert("No balance to withdraw");
        foxStaking.withdraw();

        // Check user wallet balance of FOX is still 0
        assertEq(foxToken.balanceOf(user), 0);

        vm.stopPrank();
    }
}
