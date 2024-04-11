// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IFoxStaking, StakingInfo} from "./IFoxStaking.sol";

contract FoxStakingV1 is
    Initializable,
    PausableUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;
    bool public stakingPaused;
    bool public withdrawalsPaused;
    bool public unstakingPaused;
    uint256 public cooldownPeriod;

    event UpdateCooldownPeriod(uint256 newCooldownPeriod);
    event Stake(
        address indexed account,
        uint256 amount,
        string indexed runeAddress
    );
    event Unstake(address indexed account, uint256 amount);
    event Withdraw(address indexed account, uint256 amount);
    event SetRuneAddress(
        address indexed account,
        string indexed oldRuneAddress,
        string indexed newRuneAddress
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address foxTokenAddress) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();
        foxToken = IERC20(foxTokenAddress);
        stakingPaused = false;
        withdrawalsPaused = false;
        unstakingPaused = false;
        cooldownPeriod = 28 days;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function version() external view returns (uint256) {
        return _getInitializedVersion();
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    modifier whenStakingNotPaused() {
        require(!stakingPaused, "Staking is paused");
        _;
    }

    modifier whenUnstakingNotPaused() {
        require(!unstakingPaused, "Unstaking is paused");
        _;
    }

    modifier whenWithdrawalsNotPaused() {
        require(!withdrawalsPaused, "Withdrawals are paused");
        _;
    }

    function setCooldownPeriod(uint256 newCooldownPeriod) external onlyOwner {
        cooldownPeriod = newCooldownPeriod;
        emit UpdateCooldownPeriod(newCooldownPeriod);
    }

    function stake(
        uint256 amount,
        string memory runeAddress
    ) external whenNotPaused whenStakingNotPaused {
        require(
            bytes(runeAddress).length == 43,
            "Rune address must be 43 characters"
        );
        require(amount > 0, "FOX amount to stake must be greater than 0");
        foxToken.safeTransferFrom(msg.sender, address(this), amount);

        StakingInfo storage info = stakingInfo[msg.sender];
        info.stakingBalance += amount;

        emit Stake(msg.sender, amount, runeAddress);
    }

    function unstake(
        uint256 amount
    ) external whenNotPaused whenUnstakingNotPaused {
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

    function withdraw() external whenNotPaused whenWithdrawalsNotPaused {
        StakingInfo storage info = stakingInfo[msg.sender];

        require(info.unstakingBalance > 0, "Cannot withdraw 0");
        require(block.timestamp >= info.cooldownExpiry, "Not cooled down yet");
        uint256 withdrawAmount = info.unstakingBalance;
        info.unstakingBalance = 0;
        foxToken.safeTransfer(msg.sender, withdrawAmount);
        emit Withdraw(msg.sender, withdrawAmount);
    }

    function setRuneAddress(string memory runeAddress) external {
        require(
            bytes(runeAddress).length == 43,
            "Rune address must be 43 characters"
        );
        StakingInfo storage info = stakingInfo[msg.sender];
        string memory oldRuneAddress = info.runeAddress;
        info.runeAddress = runeAddress;
        emit SetRuneAddress(msg.sender, oldRuneAddress, runeAddress);
    }

    function balanceOf(address account) external view returns (uint256 total) {
        StakingInfo memory info = stakingInfo[account];
        return info.stakingBalance + info.unstakingBalance;
    }
}
