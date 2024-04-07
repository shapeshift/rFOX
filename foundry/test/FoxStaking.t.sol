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

contract FOXStakingTest is Test {
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
