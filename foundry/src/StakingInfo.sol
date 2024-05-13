// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {UnstakingRequest} from "./UnstakingRequest.sol";

struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    uint256 earnedRewards; // earnedRewards for user since last update
    uint256 rewardPerTokenStored; // user level reward per token stored
    string runeAddress;
    UnstakingRequest[] unstakingRequests;
}
