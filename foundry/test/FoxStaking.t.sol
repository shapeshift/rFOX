// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/FoxStaking.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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

    string constant runeAddress = "thorFooBarBaz";

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
            // Free FOX tokens for each user
            foxToken.makeItRain(users[i], amounts[i]);
            // https://book.getfoundry.sh/cheatcodes/start-prank
            vm.startPrank(users[i]);
            // Approve FoxStaking contract to spend user's FOX tokens
            foxToken.approve(address(foxStaking), amounts[i]);
            // Set rune address
            foxStaking.setRuneAddress(runeAddress);
            // Stake tokens
            foxStaking.stake(amounts[i]);
            vm.stopPrank();

            // Verify each user's staked amount
            assertEq(foxStaking.balanceOf(users[i]), amounts[i]);
        }
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
        foxStaking.stake(amount);

        vm.stopPrank();
    }

    function testWithdraw_cannotWithdrawBeforeCooldown() public {
        vm.startPrank(user);

        // Check user wallet balance of FOX is 0
        assertEq(foxToken.balanceOf(user), 0);

        // Request withdraw
        foxStaking.requestWithdraw(amount);

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
        foxStaking.requestWithdraw(amount);

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
        foxStaking.requestWithdraw(amount);

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
        foxStaking.requestWithdraw(amount);

        // Fast-forward time by 28 days
        vm.warp(block.timestamp + 28 days);

        // Try to withdraw more than balance
        vm.expectRevert("Withdraw amount exceeds staked balance");
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
        foxStaking.requestWithdraw(amount);

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
        vm.expectRevert("Withdraw amount exceeds staked balance");
        foxStaking.withdraw(1);

        // Check user did not receive more FOX
        assertEq(foxToken.balanceOf(user), 1000);

        vm.stopPrank();
    }
}
