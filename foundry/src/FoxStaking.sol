// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFoxStaking} from "./IFoxStaking.sol";

contract FoxStaking is IFoxStaking {
    IERC20 public foxToken;
    mapping(address => uint256) private stakingBalances;
    mapping(address => uint256) private cooldownInfo;
    mapping(address => string) private runePairingAddresses;
    // TODO(gomes): we may want to use different heuristics than days here, but solidity supports them so why not?
    uint256 public constant COOLDOWN_PERIOD = 28 days;

    event Stake(address indexed account, uint256 amount);
    event Unstake(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event UpdateRuneAddress(address indexed user, string newRuneAddress);

    constructor(address foxTokenAddress) {
        foxToken = IERC20(foxTokenAddress);
    }

    function stake(uint256 amount) external {
        require(
            bytes(runePairingAddresses[msg.sender]).length > 0,
            "Rune address not set"
        );
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
            amount <= stakingBalances[msg.sender],
            "Withdraw amount exceeds staked balance"
        );
        stakingBalances[msg.sender] -= amount;
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
            amount <= stakingBalances[msg.sender],
            "Withdraw amount exceeds staked balance"
        );
        require(foxToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    function setRuneAddress(string memory runeAddress) external {
        runePairingAddresses[msg.sender] = runeAddress;
        emit SetRuneAddress(msg.sender, runeAddress);
    }

    function balanceOf(address account) external view returns (uint256) {
        return stakingBalances[account];
    }

    function coolDownInfo(address user) external view returns (uint256 expiry) {
        expiry = cooldownInfo[user];
        return expiry;
    }
}
