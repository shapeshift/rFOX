// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFoxStaking, StakingInfo} from "./IFoxStaking.sol";
import {console} from "forge-std/Script.sol";

contract FoxStaking is IFoxStaking {
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;
    // TODO(gomes): we may want to use different heuristics than days here, but solidity supports them so why not?
    uint256 public constant COOLDOWN_PERIOD = 28 days;

    event Stake(address indexed account, uint256 amount, string indexed runeAddress);
    event Unstake(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);
    event SetRuneAddress(address indexed account, string indexed newRuneAddress);

    constructor(address foxTokenAddress) {
        foxToken = IERC20(foxTokenAddress);
    }

    function stake(uint256 amount, string memory runeAddress) external {
        require(bytes(runeAddress).length > 0, "Rune address cannot be empty");
        require(amount > 0, "FOX amount to stake must be greater than 0");
        // Transfer fundus from msg.sender to contract assuming allowance has been set - here goes nothing
        require(
            foxToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        StakingInfo storage info = stakingInfo[msg.sender];
        info.stakingBalance += amount;

        emit Stake(msg.sender, amount, runeAddress);
    }

    function unstake(uint256 amount) external {
        require(amount > 0, "Cannot withdraw 0");
        StakingInfo storage info = stakingInfo[msg.sender];

        // User can only request withdraw for their staking balance, not more, and not their unstaking balance
        require(
            amount <= info.stakingBalance,
            "Withdraw amount exceeds staked balance"
        );

        // Set staking / unstaking amounts
        info.stakingBalance -= amount;
        info.unstakingBalance += amount;

        // Set or update the cooldown period
        info.cooldownExpiry = block.timestamp + COOLDOWN_PERIOD;

        emit Unstake(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "Cannot withdraw 0");

        StakingInfo storage info = stakingInfo[msg.sender];
        // Note this doesn't do partial cooldowns for a given amount - currently we assume a global cooldown per address
        require(
            block.timestamp >= info.cooldownExpiry,
            "Not cooled down yet"
        );
        require(
            amount <= info.unstakingBalance,
            "Withdraw amount exceeds unstaking balance"
        );
        info.unstakingBalance -= amount;
        require(foxToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    function setRuneAddress(string memory runeAddress) external {
        StakingInfo storage info = stakingInfo[msg.sender];
        info.runeAddress = runeAddress;
        emit SetRuneAddress(msg.sender, runeAddress);
    }

    function balanceOf(address account) external view returns (uint256 total) {
        StakingInfo memory info = stakingInfo[account];
        return info.stakingBalance + info.unstakingBalance;
    }
}
