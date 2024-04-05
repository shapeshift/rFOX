// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IFoxStaking.sol";

contract FOXStaking is IFOXStaking {
    address private constant FOX_TOKEN_ADDRESS = 0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d;
    IERC20 public foxToken = IERC20(FOX_TOKEN_ADDRESS);
    mapping(address => uint256) private _stakingBalances;
    mapping(address => uint256) private cooldownInfo;
    mapping(address => address) private runePairingAddress;
    // TODO(gomes): we may want to use different heuristics than days here, but solidity supports them so why not?
    uint256 public constant COOLDOWN_PERIOD = 28 days;

    event Stake(address indexed user, uint256 amount, address runeAddress);
    event Unstake(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event ClaimRewards(address indexed user);
    event UpdateRuneAddress(address indexed user, address newRuneAddress);

    constructor(address foxTokenAddress) {
      // Empty constructor - we don't need to initialize anything here though we may want some guards against re-entrency, or maybe not needed here?
    }

    // TODO(gomes): we may want the rune address to not be passed while staking but as an additional call 
    // to avoid having to pass it again every time when e.g staking more
    function stake(uint256 amount, address runeAddress) external  {
        require(amount > 0, "FOX amount to stake must be greater than 0");
        // Transfer fundus from msg.sender to contract assuming allowance has been set - here goes nothing
        require(foxToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Note - we do the thing *after* ensuring the require above didn't revert, or this could be very dangerous
        _stakingBalances[msg.sender] += amount;
        runePairingAddress[msg.sender] = runeAddress;

        emit Stake(msg.sender, amount, runeAddress);
    }

    function requestWithdraw(uint256 amount) external  {
        require(amount <= _stakingBalances[msg.sender], "Withdraw amount exceeds staked balance");
        _stakingBalances[msg.sender] -= amount;
        cooldownInfo[msg.sender] = block.timestamp + COOLDOWN_PERIOD;
        emit Unstake(msg.sender, amount);
    }

    function withdraw(uint256 amount) external  {
        // Note this doesn't do partial cooldowns for a given amount - currently we assume a global cooldown per address
        require(block.timestamp >= cooldownInfo[msg.sender], "Not cooled down yet");
        require(amount > 0, "Cannot withdraw 0");
        require(foxToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    function claimRewards() external  {
        // This doesn't do anything - only emits an event to be listened to by the script once done
        emit ClaimRewards(msg.sender);
    }

    function setRuneAddress(address runeAddress) external  {
        runePairingAddress[msg.sender] = runeAddress;
        emit UpdateRuneAddress(msg.sender, runeAddress);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _stakingBalances[account];
    }

    function coolDownInfo(address user) external view returns (uint256 amount, uint256 expiry) {
        // Currently the assumption is this is a global cooldown, so we may not want this fn to take an amount?
        amount = _stakingBalances[user]; 
        expiry = cooldownInfo[user];
        return (amount, expiry);
    }
}
