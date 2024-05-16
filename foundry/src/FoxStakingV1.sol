// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {StakingInfo} from "./StakingInfo.sol";
import {UnstakingRequest} from "./UnstakingRequest.sol";

contract FoxStakingV1 is
    Initializable,
    PausableUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;
    bool public stakingPaused;
    bool public withdrawalsPaused;
    bool public unstakingPaused;
    uint256 public cooldownPeriod;

    uint256 public totalStaked;
    uint256 public totalCoolingDown;

    uint256 public constant REWARD_RATE = 1_000_000_000;
    uint256 public constant WAD = 1e18;
    uint256 public lastUpdateTimestamp;
    uint256 public rewardPerTokenStored;

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
        cooldownPeriod = 28 days;
        lastUpdateTimestamp = block.timestamp;
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

    /// @notice Sets the cooldown period for unstaking requests.
    /// @param newCooldownPeriod The new cooldown period to be set.
    function setCooldownPeriod(uint256 newCooldownPeriod) external onlyOwner {
        cooldownPeriod = newCooldownPeriod;
        emit UpdateCooldownPeriod(newCooldownPeriod);
    }

    /// @notice Returns the current amount of reward allocated per staked token.
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTimestamp) * REWARD_RATE * WAD) /
                totalStaked);
    }

    /// @notice Returns the total reward earnings associated with a given address for its entire lifetime of staking.
    /// @param account The address we're getting the earned rewards for.
    function earned(address account) public view returns (uint256) {
        StakingInfo memory info = stakingInfo[account];
        return
            (info.stakingBalance *
                (rewardPerToken() - info.rewardPerTokenStored)) /
            WAD +
            info.earnedRewards;
    }

    /// @notice Allows a user to stake a specified amount of FOX tokens and assign a RUNE address for rewards - which can be changed later on.
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be staked.
    /// @param runeAddress The RUNE address to be associated with the user's staked FOX position.
    function stake(
        uint256 amount,
        string memory runeAddress
    ) external whenNotPaused whenStakingNotPaused nonReentrant {
        require(
            bytes(runeAddress).length == 43,
            "Rune address must be 43 characters"
        );
        require(amount > 0, "FOX amount to stake must be greater than 0");
        updateReward(msg.sender);
        foxToken.safeTransferFrom(msg.sender, address(this), amount);

        StakingInfo storage info = stakingInfo[msg.sender];
        info.stakingBalance += amount;
        info.runeAddress = runeAddress;
        totalStaked += amount;

        emit Stake(msg.sender, amount, runeAddress);
    }

    /// @notice Initiates the unstake process for a specified amount of FOX, starting the cooldown period (28 days).
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be unstaked.
    function unstake(
        uint256 amount
    ) external whenNotPaused whenUnstakingNotPaused nonReentrant {
        require(amount > 0, "Cannot unstake 0");
        StakingInfo storage info = stakingInfo[msg.sender];

        // User can only unstake (request withdraw) for their staking balance, not more, and not their unstaking balance
        require(
            amount <= info.stakingBalance,
            "Unstake amount exceeds staked balance"
        );
        updateReward(msg.sender);

        // Set staking / unstaking amounts
        info.stakingBalance -= amount;
        info.unstakingBalance += amount;
        totalStaked -= amount;
        totalCoolingDown += amount;

        UnstakingRequest memory unstakingRequest = UnstakingRequest({
            unstakingBalance: amount,
            cooldownExpiry: block.timestamp + cooldownPeriod
        });

        info.unstakingRequests.push(unstakingRequest); // append to the end of unstakingRequests array

        emit Unstake(msg.sender, amount, unstakingRequest.cooldownExpiry);
    }

    /// @notice Allows a user to withdraw a specified claim by index
    /// @param index The index of the claim to withdraw
    function withdraw(
        uint256 index
    ) public whenNotPaused whenWithdrawalsNotPaused nonReentrant {
        StakingInfo storage info = stakingInfo[msg.sender];
        require(
            info.unstakingRequests.length > 0,
            "No unstaking requests found"
        );

        require(info.unstakingRequests.length > index, "invalid index");

        UnstakingRequest memory unstakingRequest = info.unstakingRequests[
            index
        ];

        require(
            block.timestamp >= unstakingRequest.cooldownExpiry,
            "Not cooled down yet"
        );

        if (info.unstakingRequests.length > 1) {
            // we have more elements in the array, so shift the last element to the index being withdrawn
            // and then shorten the array by 1
            info.unstakingRequests[index] = info.unstakingRequests[
                info.unstakingRequests.length - 1
            ];
            info.unstakingRequests.pop();
        } else {
            // the array is done, we can delete the whole thing
            delete info.unstakingRequests;
        }
        info.unstakingBalance -= unstakingRequest.unstakingBalance;
        totalCoolingDown -= unstakingRequest.unstakingBalance;
        foxToken.safeTransfer(msg.sender, unstakingRequest.unstakingBalance);
        emit Withdraw(msg.sender, unstakingRequest.unstakingBalance);
    }

    /// @notice processes the most recent unstaking request available to the user, else reverts.
    function withdraw() external {
        StakingInfo memory info = stakingInfo[msg.sender];
        uint256 length = info.unstakingRequests.length;
        require(length > 0, "No unstaking requests found");
        uint256 indexToProcess;
        uint256 earliestCooldownExpiry = type(uint256).max;

        for (uint256 i; i < length; i++) {
            UnstakingRequest memory unstakingRequest = info.unstakingRequests[
                i
            ];
            if (block.timestamp >= unstakingRequest.cooldownExpiry) {
                // this claim is ready to be processed
                if (unstakingRequest.cooldownExpiry < earliestCooldownExpiry) {
                    // we found a more recent claim we can process.
                    earliestCooldownExpiry = unstakingRequest.cooldownExpiry;
                    indexToProcess = i;
                }
            }
        }

        require(
            earliestCooldownExpiry != type(uint256).max,
            "Not cooled down yet"
        );
        withdraw(indexToProcess);
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

    /// @notice helper function to access dynamic array nested in struct from external sources
    /// @param account The address we're getting the unstaking request for.
    /// @param index The index of the unstaking request array we're getting.
    function getUnstakingRequest(
        address account,
        uint256 index
    ) external view returns (UnstakingRequest memory) {
        return stakingInfo[account].unstakingRequests[index];
    }

    /// @notice returns the numbery of ustaking request elements for a given address
    /// @dev useful for off chain processing
    /// @param account The address we're getting the unstaking info count for.
    /// @return length The number of unstaking request elements.
    function getUnstakingRequestCount(
        address account
    ) external view returns (uint256) {
        return stakingInfo[account].unstakingRequests.length;
    }

    /// @notice Updates all variables when changes to staking amounts are made.
    /// @param account The address of the account to update.
    function updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTimestamp = block.timestamp;
        StakingInfo storage info = stakingInfo[account];
        info.earnedRewards = earned(account);
        info.rewardPerTokenStored = rewardPerTokenStored;
    }
}
