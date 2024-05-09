// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {UnstakingRequest} from "./UnstakingRequest.sol";

struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    uint256 earnedRewards;
    uint256 rewardPerTokenPaid;
    string runeAddress;
    UnstakingRequest[] unstakingRequests;
}
