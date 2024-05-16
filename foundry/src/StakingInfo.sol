// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {UnstakingRequest} from "./UnstakingRequest.sol";

/// @notice Struct to store staking information for a given user.
/// @param stakingBalance The total amount of tokens staked by the user.
/// @param unstakingBalance The total amount of tokens pending unstaking.
/// @param earnedRewards The rewards earned by the user since the last epoch.
/// @param rewardPerTokenStored The user-level reward per token stored.
/// @param runeAddress The users configured RUNE address.
/// @param unstakingRequests The list of pending unstaking requests for the user.
struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    uint256 earnedRewards;
    uint256 rewardPerTokenStored;
    string runeAddress;
    UnstakingRequest[] unstakingRequests;
}
