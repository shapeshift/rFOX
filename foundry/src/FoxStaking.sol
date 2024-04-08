// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFoxStaking} from "./IFoxStaking.sol";
import {console} from "forge-std/Script.sol";

contract FoxStaking is IFoxStaking {
    IERC20 public foxToken;
    mapping(address => uint256) private stakingBalances;
    mapping(address => uint256) private unstakingBalances;
    mapping(address => uint256) private cooldownInfo;
    mapping(address => string) private runePairingAddresses;
    // TODO(gomes): we may want to use different heuristics than days here, but solidity supports them so why not?
    uint256 public constant COOLDOWN_PERIOD = 28 days;

    event Stake(address indexed account, uint256 amount);
    event Unstake(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);
    event SetRuneAddress(address indexed account, string newRuneAddress);

    constructor(address foxTokenAddress) {
        foxToken = IERC20(foxTokenAddress);
    }

    function stake(uint256 amount) external {
        require(amount > 0, "FOX amount to stake must be greater than 0");
        // Transfer fundus from msg.sender to contract assuming allowance has been set - here goes nothing
        require(
            foxToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        stakingBalances[msg.sender] += amount;

        emit Stake(msg.sender, amount);
    }

    function requestWithdraw(uint256 amount) external {
        require(amount > 0, "Cannot withdraw 0");
        require(
            amount <=
                stakingBalances[msg.sender] + unstakingBalances[msg.sender],
            "Withdraw amount exceeds staked balance"
        );
        // Check if the user has already requested a withdrawal for the same amount or more
        // Prevents a user from waiting longer than necessary to withdraw
        require(amount > unstakingBalances[msg.sender], "Redundant request");

        // Reset a previous withdrawal request if it exists
        if (unstakingBalances[msg.sender] > 0) {
            stakingBalances[msg.sender] += unstakingBalances[msg.sender];
            unstakingBalances[msg.sender] = 0;
        }

        // Set staking / unstaking amounts
        stakingBalances[msg.sender] -= amount;
        unstakingBalances[msg.sender] = amount;

        // Set new cooldown period
        cooldownInfo[msg.sender] = block.timestamp + COOLDOWN_PERIOD;

        emit Unstake(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        // Note this doesn't do partial cooldowns for a given amount - currently we assume a global cooldown per address
        require(
            block.timestamp >= cooldownInfo[msg.sender],
            "Not cooled down yet"
        );
        require(amount > 0, "Cannot withdraw 0");
        require(
            amount <= unstakingBalances[msg.sender],
            "Withdraw amount exceeds unstaking balance"
        );
        require(foxToken.transfer(msg.sender, amount), "Transfer failed");
        unstakingBalances[msg.sender] -= amount;
        emit Withdraw(msg.sender, amount);
    }

    function setRuneAddress(string memory runeAddress) external {
        runePairingAddresses[msg.sender] = runeAddress;
        emit SetRuneAddress(msg.sender, runeAddress);
    }

    function balanceOf(
        address account
    )
        external
        view
        returns (uint256 total, uint256 staking, uint256 unstaking)
    {
        unstaking = unstakingBalances[account];
        staking = stakingBalances[account];
        total = unstaking + staking;
        return (total, staking, unstaking);
    }

    function coolDownInfo(
        address account
    ) external view returns (uint256 expiry) {
        expiry = cooldownInfo[account];
        return expiry;
    }
}
