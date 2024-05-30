// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFOXToken is ERC20 {
    constructor() ERC20("Mock FOX Token", "FOX") {
        _mint(address(this), 10e27); // 10 billion FOX with 18 decimals - more than mainnet, for testing.
    }

    function makeItRain(address to, uint256 amount) public {
        _transfer(address(this), to, amount);
    }
}
