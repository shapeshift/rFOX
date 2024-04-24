// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import {UnstakingInfo} from "./UnstakingInfo.sol";

struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    string runeAddress;
    UnstakingInfo[] unstakingInfo;
}
