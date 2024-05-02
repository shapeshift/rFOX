// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {UnstakingRequest} from "./UnstakingRequest.sol";

struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    string runeAddress;
    UnstakingRequest[] unstakingRequests;
}
