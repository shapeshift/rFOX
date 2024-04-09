// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IFoxStaking, StakingInfo} from "./IFoxStaking.sol";
import {console} from "forge-std/Script.sol";

contract FoxStaking is 
  IFoxStaking, 
  Ownable(msg.sender), // Deployer is the owner
  Pausable
  {
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;

    bool public stakingPaused = false;
    bool public withdrawalsPaused = false;
    bool public unstakingPaused = false;

    uint256 public cooldownPeriod = 28 days;

    event UpdateCooldownPeriod(uint256 newCooldownPeriod);

    event Stake(address indexed account, uint256 amount, string indexed runeAddress);
    event Unstake(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);
    event SetRuneAddress(address indexed account, string indexed newRuneAddress);

    constructor(address foxTokenAddress) {
        foxToken = IERC20(foxTokenAddress);
    }

    function pauseStaking() external onlyOwner {
      stakingPaused = true;
    }

    function unpauseStaking() external onlyOwner {
      stakingPaused = false;
    }

    function pauseWithdrawals() external onlyOwner {
      withdrawalsPaused = true;
    }

    function unpauseWithdrawals() external onlyOwner {
      withdrawalsPaused = false;
    }

    function pauseUnstaking() external onlyOwner {
        unstakingPaused = true;
    }

    function unpauseUnstaking() external onlyOwner {
        unstakingPaused = false;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    modifier whenStakingUnpaused() {
      require(!stakingPaused, "Staking is paused");
      _;
    }

    modifier whenUnstakingUnpaused() {
      require(!unstakingPaused, "Unstaking is paused");
      _;
    }

    modifier whenWithdrawalsUnpaused() {
      require(!withdrawalsPaused, "Withdrawals are paused");
      _;
    }

    function setCooldownPeriod(uint256 newCooldownPeriod) external onlyOwner {
        cooldownPeriod = newCooldownPeriod;
        emit UpdateCooldownPeriod(newCooldownPeriod);
    }

    function stake(uint256 amount, string memory runeAddress) external whenNotPaused whenStakingUnpaused {
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

    function unstake(uint256 amount) external whenNotPaused whenUnstakingUnpaused {
        require(amount > 0, "Cannot unstake 0");
        StakingInfo storage info = stakingInfo[msg.sender];

        // User can only unstake (request withdraw) for their staking balance, not more, and not their unstaking balance
        require(
            amount <= info.stakingBalance,
            "Unstake amount exceeds staked balance"
        );

        // Set staking / unstaking amounts
        info.stakingBalance -= amount;
        info.unstakingBalance += amount;

        // Set or update the cooldown period
        info.cooldownExpiry = block.timestamp + cooldownPeriod;

        emit Unstake(msg.sender, amount);
    }

    function withdraw() external whenNotPaused whenWithdrawalsUnpaused {
        StakingInfo storage info = stakingInfo[msg.sender];

        require(info.unstakingBalance > 0, "Cannot withdraw 0");
        require(
            block.timestamp >= info.cooldownExpiry,
            "Not cooled down yet"
        );
        uint256 withdrawAmount = info.unstakingBalance;
        info.unstakingBalance = 0;
        require(foxToken.transfer(msg.sender, withdrawAmount), "Transfer failed");
        emit Withdraw(msg.sender, withdrawAmount);
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
