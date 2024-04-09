// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/FoxStaking.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MockFOXToken is ERC20 {
    constructor() ERC20("Mock FOX Token", "FOX") {
        // 1M FOX for testing, only in local chain can't use this as voting power soz
        _mint(address(this), 1e24);
    }

    function makeItRain(address to, uint256 amount) public {
        _transfer(address(this), to, amount);
    }
}

contract FOXStakingTestStaking is Test {
    FoxStaking public foxStaking;
    MockFOXToken public foxToken;

    function setUp() public {
        foxToken = new MockFOXToken();
        foxStaking = new FoxStaking(address(foxToken));
    }

    function testStaking() public {
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
            // Unique mock address per user
            string memory runeAddress = string(abi.encodePacked("runeAddress", Strings.toString(i)));
            // Free FOX tokens for each user
            foxToken.makeItRain(users[i], amounts[i]);
            // https://book.getfoundry.sh/cheatcodes/start-prank
            vm.startPrank(users[i]);
            // Approve FoxStaking contract to spend user's FOX tokens
            foxToken.approve(address(foxStaking), amounts[i]);
            // Stake tokens
            foxStaking.stake(amounts[i], runeAddress);
            vm.stopPrank();

            // Verify each user's staked amount
            (uint256 total) = foxStaking.balanceOf(users[i]);
            assertEq(total, amounts[i]);
        }
    }
}

contract FOXStakingTestunstake is Test {
    FoxStaking public foxStaking;
    MockFOXToken public foxToken;
    address user = address(0xBEEF);
    uint256 amount = 1000;

    string constant runeAddress = "thorFooBarBaz";

    function setUp() public {
        foxToken = new MockFOXToken();
        foxStaking = new FoxStaking(address(foxToken));

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

    function testunstake_cannotRequestZero() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance, uint256 unstakingBalance, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance + unstakingBalance, 1000);
        vm.assertEq(stakingBalance, 1000);
        vm.assertEq(unstakingBalance, 0);

        // Try to request withdraw 0
        vm.expectRevert("Cannot withdraw 0");
        foxStaking.unstake(0);

        // Check user staking balances are unchanged
        (uint256 stakingBalance_after, uint256 unstakingBalance_after, , ) = foxStaking.stakingInfo(user);

        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testunstake_cannotRequestMoreThanBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance_before, uint256 unstakingBalance_before, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);
        
        // Try to request more than balance
        vm.expectRevert("Withdraw amount exceeds staked balance");
        foxStaking.unstake(amount + 1);

        // Check user staking balances are unchanged
        (uint256 stakingBalance_after, uint256 unstakingBalance_after, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 1000);
        vm.assertEq(unstakingBalance_after, 0);

        vm.stopPrank();
    }

    function testunstake_canRequestBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance_before, uint256 unstakingBalance_before, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Try to request exact balance
        foxStaking.unstake(amount);

        // Check user staking balances reflect the withdrawal request
        (uint256 stakingBalance_after, uint256 unstakingBalance_after, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 0);
        vm.assertEq(unstakingBalance_after, 1000);

        vm.stopPrank();
    }

    function testunstake_canPartialBalance() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance_before, uint256 unstakingBalance_before, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Try to request exact balance
        foxStaking.unstake(800);

        // Check user staking balances reflect the withdrawal request
        (uint256 stakingBalance_after, uint256 unstakingBalance_after, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_after + unstakingBalance_after, 1000);
        vm.assertEq(stakingBalance_after, 200);
        vm.assertEq(unstakingBalance_after, 800);

        vm.stopPrank();
    }

    // Tests that requesting to withdraw part of the balance, waiting the cooldown period, withdrawing, then requesting the rest of the balance works
    function testunstake_partialWithdrawThenFullWithdraw() public {
        vm.startPrank(user);

        // Check user staking balances
        (uint256 stakingBalance_before, uint256 unstakingBalance_before, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_before + unstakingBalance_before, 1000);
        vm.assertEq(stakingBalance_before, 1000);
        vm.assertEq(unstakingBalance_before, 0);

        // Request withdraw of 300 FOX
        foxStaking.unstake(300);

        // Ensure attempting to withdraw the 300 FOX reverts
        vm.expectRevert("Not cooled down yet");
        foxStaking.withdraw(300);

        // Check cooldown period is set
        (uint256 stakingBalance_one, uint256 unstakingBalance_one, uint256 cooldownExpiry_one, ) = foxStaking.stakingInfo(user);
        vm.assertEq(cooldownExpiry_one, block.timestamp + 28 days);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_one + unstakingBalance_one, 1000);
        vm.assertEq(stakingBalance_one, 700);
        vm.assertEq(unstakingBalance_one, 300);

        // Time warp 28 days
        vm.warp(block.timestamp + 28 days);

        // Withdraw the 300 FOX
        foxStaking.withdraw(300);

        // Check user staking balances reflect the withdrawal
        (uint256 stakingBalance_two, uint256 unstakingBalance_two, , ) = foxStaking.stakingInfo(user);
        vm.assertEq(stakingBalance_two + unstakingBalance_two, 700);
        vm.assertEq(stakingBalance_two, 700);
        vm.assertEq(unstakingBalance_two, 0);

        // Request withdraw of the remaining 700 FOX
        foxStaking.unstake(700);

        // Check cooldown period is set
        (uint256 stakingBalance_three, uint256 unstakingBalance_three, uint256 cooldownExpiry_three, ) = foxStaking.stakingInfo(user);
        vm.assertGt(cooldownExpiry_three, block.timestamp);

        // Check user staking balances reflect the withdrawal request
        vm.assertEq(stakingBalance_three + unstakingBalance_three, 700);
        vm.assertEq(stakingBalance_three, 0);
        vm.assertEq(unstakingBalance_three, 700);

        vm.stopPrank();
    }
}

contract FOXStakingTestWithdraw is Test {
    FoxStaking public foxStaking;
    MockFOXToken public foxToken;
    address user = address(0xBEEF);
    uint256 amount = 1000;

    string constant runeAddress = "thorFooBarBaz";

    function setUp() public {
        foxToken = new MockFOXToken();
        foxStaking = new FoxStaking(address(foxToken));

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
        foxStaking.withdraw(amount);

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
        foxStaking.withdraw(amount);

        // Check user received the withdrawn amount of FOX
        assertEq(foxToken.balanceOf(user), amount);

        vm.stopPrank();
    }

    function testWithdraw_cannotWithdrawZero() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.unstake(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw 0
        vm.expectRevert("Cannot withdraw 0");
        foxStaking.withdraw(0);

        // Check user wallet balance of FOX is still 0
        assertEq(foxToken.balanceOf(user), 0);

        vm.stopPrank();
    }

    function testWithdraw_cannotWithdrawMoreThanBalance() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.unstake(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw more than balance
        vm.expectRevert("Withdraw amount exceeds unstaking balance");
        foxStaking.withdraw(amount + 1);

        // Check user wallet balance of FOX is still 0
        assertEq(foxToken.balanceOf(user), 0);

        vm.stopPrank();
    }

    function testWithdraw_canWithdrawPartialBalance() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.unstake(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw part of balance
        foxStaking.withdraw(10);

        // Check user received the withdrawn amount of FOX
        assertEq(foxToken.balanceOf(user), 10);

        // Try to withdraw part of balance
        foxStaking.withdraw(100);

        // Check user received the withdrawn amount of FOX
        assertEq(foxToken.balanceOf(user), 110);

        // Try to withdraw remaining balance
        foxStaking.withdraw(890);

        // Check user received the withdrawn amount of FOX
        assertEq(foxToken.balanceOf(user), 1000);

        // Try to withdraw 1 wei more than balance
        vm.expectRevert("Withdraw amount exceeds unstaking balance");
        foxStaking.withdraw(1);

        // Check user did not receive more FOX
        assertEq(foxToken.balanceOf(user), 1000);

        vm.stopPrank();
    }
}
