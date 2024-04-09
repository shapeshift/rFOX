// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

struct StakingInfo {
  uint256 stakingBalance;
  uint256 unstakingBalance;
  uint256 cooldownExpiry;
  string runeAddress;
}


/// @title WIP high-level interface for FOX token staking contract
/// @notice This interface outlines the functions for staking FOX tokens, managing RUNE addresses for rewards, and claiming 'em.
interface IFoxStaking {
    /// @notice Allows a user to stake a specified amount of FOX tokens and assign a RUNE address for rewards - which can be changed later on.
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be staked.
    /// @param runeAddress The RUNE address to be associated with the user's staked FOX position.
    function stake(uint256 amount, string memory runeAddress) external;

    /// @notice Initiates the unstake process for a specified amount of FOX, starting the cooldown period (28 days).
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param amount The amount of FOX tokens to be unstaked.
    function unstake(uint256 amount) external;

    /// @notice Withdraws FOX tokens - assuming there's anything to withdraw and unstake cooldown period has completed - else reverts
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    function withdraw() external;

    /// @notice Allows a user to initially set (or update) their THORChain (RUNE) address for receiving staking rewards.
    /// This has to be initiated by the user itself i.e msg.sender only, cannot be called by an address for another
    /// @param runeAddress The new RUNE address to be associated with the user's staked FOX position.
    function setRuneAddress(string memory runeAddress) external;

    /// @notice View the staked balance of FOX tokens for a given address.
    /// This can be initiated by any address with any address as param, as this has view modifier i.e everything is public on-chain
    /// @param account The address we're getting the staked FOX balance for.
    /// @return total The total amount of FOX tokens held.
    function balanceOf(
        address account
    ) external view returns (uint256 total);
}
