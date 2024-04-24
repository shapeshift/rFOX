// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {StakingInfo} from "./StakingInfo.sol";
import {UnstakingInfo} from "./UnstakingInfo.sol";

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
    event Unstake(
        address indexed account,
        uint256 amount,
        uint256 cooldownExpiry
    );
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

    /// @notice Pauses deposits
    function pauseStaking() external onlyOwner {
        stakingPaused = true;
    }

    /// @notice Unpauses deposits
    function unpauseStaking() external onlyOwner {
        stakingPaused = false;
    }

    /// @notice Pauses withdrawals
    function pauseWithdrawals() external onlyOwner {
        withdrawalsPaused = true;
    }

    /// @notice Unpauses withdrawals
    function unpauseWithdrawals() external onlyOwner {
        withdrawalsPaused = false;
    }

    /// @notice Pauses unstaking
    function pauseUnstaking() external onlyOwner {
        unstakingPaused = true;
    }

    /// @notice Unpauses unstaking
    function unpauseUnstaking() external onlyOwner {
        unstakingPaused = false;
    }

    /// @notice Sets contract-level paused state
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Sets contract-level unpaused state
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

    /// @notice Allows a user to stake a specified amount of FOX tokens and assign a RUNE address for rewards - which can be changed later on.
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be staked.
    /// @param runeAddress The RUNE address to be associated with the user's staked FOX position.
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
        info.runeAddress = runeAddress;

        emit Stake(msg.sender, amount, runeAddress);
    }

    /// @notice Initiates the unstake process for a specified amount of FOX, starting the cooldown period (28 days).
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be unstaked.
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

        UnstakingInfo memory unstakingInfo = UnstakingInfo({
            unstakingBalance: amount,
            cooldownExpiry: block.timestamp + cooldownPeriod
        });

        info.unstakingInfo.push(unstakingInfo); // append to the end of unstakingInfo array

        emit Unstake(msg.sender, amount, unstakingInfo.cooldownExpiry);
    }

    // this function seems odd at first, but we have to take into account the possibility
    // that the cool down period has changed, and its possible the array is NOT in chronological
    // order of expiration.  If that occurs, a user could want to be able to process index 1 before
    // index 0. This gives them the ability to do that, without have to worry about
    // some complex resize logic while we iterate the array that would better be done off chain
    function withdraw(
        uint256 index
    ) public whenNotPaused whenWithdrawalsNotPaused {
        StakingInfo storage info = stakingInfo[msg.sender];
        require(info.unstakingInfo.length > 0, "No balance to withdraw");

        require(info.unstakingInfo.length > index, "invalid index");

        UnstakingInfo memory unstakingInfo = info.unstakingInfo[index];

        require(
            block.timestamp >= unstakingInfo.cooldownExpiry,
            "Not cooled down yet"
        );

        if (info.unstakingInfo.length > 1) {
            // we have more elements in the array, so shift the last element to the index being withdrawn
            // and then shorten the array by 1
            info.unstakingInfo[index] = info.unstakingInfo[
                info.unstakingInfo.length - 1
            ];
            info.unstakingInfo.pop();
        } else {
            // the array is done, we can delete the whole thing
            delete info.unstakingInfo;
        }
        info.unstakingBalance -= unstakingInfo.unstakingBalance;
        foxToken.safeTransfer(msg.sender, unstakingInfo.unstakingBalance);
        emit Withdraw(msg.sender, unstakingInfo.unstakingBalance);
    }

    /// @notice Withdraws FOX tokens - assuming there's anything to withdraw and unstake cooldown period has completed - else reverts
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    function withdraw() external {
        withdraw(0);
    }

    /// @notice Allows a user to initially set (or update) their THORChain (RUNE) address for receiving staking rewards.
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param runeAddress The new RUNE address to be associated with the user's staked FOX position.
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

    /// @notice View the staked balance of FOX tokens for a given address.
    /// This can be initiated by any address with any address as param, as this has view modifier i.e everything is public on-chain
    /// @param account The address we're getting the staked FOX balance for.
    /// @return total The total amount of FOX tokens held.
    function balanceOf(address account) external view returns (uint256 total) {
        StakingInfo memory info = stakingInfo[account];
        return info.stakingBalance + info.unstakingBalance;
    }

    function getUnstakingInfo(address account, uint256 index)
        external
        view
        returns (UnstakingInfo memory)
    {
        return stakingInfo[account].unstakingInfo[index];
    }
}
