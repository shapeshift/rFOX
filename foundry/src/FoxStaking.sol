// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFoxStaking, StakingInfo} from "./IFoxStaking.sol";
import {console} from "forge-std/Script.sol";

contract FoxStaking is IFoxStaking {
    IERC20 public foxToken;
    mapping(address => uint256) stakingBalances;
    mapping(address => uint256) unstakingBalances;
    mapping(address => uint256) cooldownInfo;
    mapping(address => string) runePairingAddresses;
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

        // User can only request withdraw for their staking balance, not more, and not their unstaking balance
        require(
            amount <= stakingBalances[msg.sender],
            "Withdraw amount exceeds staked balance"
        );

        // Set staking / unstaking amounts
        stakingBalances[msg.sender] -= amount;
        unstakingBalances[msg.sender] += amount;

        // Set or update the cooldown period
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
        unstakingBalances[msg.sender] -= amount;
        require(foxToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    function setRuneAddress(string memory runeAddress) external {
        runePairingAddresses[msg.sender] = runeAddress;
        emit SetRuneAddress(msg.sender, runeAddress);
    }

    function balanceOf(address account) external view returns (uint256 total) {
        uint256 unstaking = unstakingBalances[account];
        uint256 staking = stakingBalances[account];
        total = unstaking + staking;
        return total;
    }

    function stakingInfo(address account) external view returns (StakingInfo memory) {
      return StakingInfo({
        stakingBalance: stakingBalances[account],
        unstakingBalance: unstakingBalances[account],
        cooldownExpiry: cooldownInfo[account] 
      });
    }
}
