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

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);
    }

    function testCannotStakeWhenStakingPaused() public {
        foxStaking.pauseStaking();

        address user = address(0xBABE);
        vm.startPrank(user);
        vm.expectRevert("Staking is paused");
        foxStaking.stake(1e18, "runeAddress");
        vm.stopPrank();
    }

    function testCanStakeAfterUnpausingStake() public {
        address user = address(0xBABE);
        uint256 amount = 1000;
        string
            memory runeAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

        foxToken.makeItRain(user, amount);

        // Check user staking balances
        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 0);
        vm.assertEq(stakingBalance_before, 0);
        vm.assertEq(unstakingBalance_before, 0);

        foxStaking.pauseStaking();

        vm.startPrank(user);
        vm.expectRevert("Staking is paused");
        foxStaking.stake(amount, runeAddress);
        vm.stopPrank();

        foxStaking.unpauseStaking();

        vm.startPrank(user);
        foxToken.approve(address(foxStaking), amount);
        foxStaking.stake(amount, runeAddress);

        // Check user staking balances reflect the withdrawal request
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testCannotStakeWhenContractPaused() public {
        foxStaking.pause();

        address user = address(0xBABE);
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(Pausable.EnforcedPause.selector)
        );
        foxStaking.stake(1e18, "runeAddress");
        vm.stopPrank();
    }

    function testCanStakeWhenUnpausingAfterPaused() public {
        foxStaking.pause();

        address user = address(0xBABE);
        uint256 amount = 1000;
        string
            memory runeAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

        (
            uint256 stakingBalance_before,
            uint256 unstakingBalance_before,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 0);
        vm.assertEq(stakingBalance_before, 0);
        vm.assertEq(unstakingBalance_before, 0);

        foxToken.makeItRain(user, amount);

        vm.startPrank(user);
        foxToken.approve(address(foxStaking), amount);
        vm.expectRevert(
            abi.encodeWithSelector(Pausable.EnforcedPause.selector)
        );
        foxStaking.stake(amount, runeAddress);
        vm.stopPrank();

        foxStaking.unpause();

        vm.startPrank(user);
        foxStaking.stake(amount, runeAddress);

        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);
    }

    function testStake_cannotStakeZero() public {
        address user = address(0xD00D);
        string
            memory runeAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance, uint256 unstakingBalance, , ) = foxStaking
            .stakingInfo(user);
        vm.assertEq(stakingBalance + unstakingBalance, 0);
        vm.assertEq(stakingBalance, 0);
        vm.assertEq(unstakingBalance, 0);

        // Try to stake 0
        vm.expectRevert("FOX amount to stake must be greater than 0");
        foxStaking.stake(0, runeAddress);

        // Check user staking balances are unchanged
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 0);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testStake_cannotStakeWithEmptyRuneAddress() public {
        address user = address(0xD00D);

        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance, uint256 unstakingBalance, , ) = foxStaking
            .stakingInfo(user);
        vm.assertEq(stakingBalance + unstakingBalance, 0);
        vm.assertEq(stakingBalance, 0);
        vm.assertEq(unstakingBalance, 0);

        // Try to stake with empty rune address
        vm.expectRevert("Rune address must be 43 characters");
        foxStaking.stake(1e18, "");

        // Check user staking balances are unchanged
        (
            uint256 stakingBalance_after,
            uint256 unstakingBalance_after,
            ,

        ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 0);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    // "e2e" staking test for multiple users
    function testStaking() public {
        string[3] memory runeAddresses = [
            "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs0",
            "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs1",
            "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncs2"
        ];
        address[] memory users = new address[](3);
        users[0] = address(0xBABE);
        users[1] = address(0xC0DE);
        users[2] = address(0xD00D);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e18; // 100 FOX
        amounts[1] = 200e18; // 200 FOX
        amounts[2] = 300e18; // 300 FOX

        // Simulate each user staking FOX tokens
        for (uint256 i = 0; i < users.length; i++) {
            // Free FOX tokens for each user
            foxToken.makeItRain(users[i], amounts[i]);
            // https://book.getfoundry.sh/cheatcodes/start-prank
            vm.startPrank(users[i]);
            // Approve FoxStaking contract to spend user's FOX tokens
            foxToken.approve(address(foxStaking), amounts[i]);
            // Stake tokens
            foxStaking.stake(amounts[i], runeAddresses[i]);
            vm.stopPrank();

            // Verify each user's staked amount
            uint256 total = foxStaking.balanceOf(users[i]);
            assertEq(total, amounts[i]);

            // Verify each user's rune address
            (, , , string memory runeAddress) = foxStaking.stakingInfo(
                users[i]
            );
            assertEq(runeAddress, runeAddresses[i]);
        }
    }
}
