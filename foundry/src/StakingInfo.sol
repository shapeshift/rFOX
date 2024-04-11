// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

struct StakingInfo {
    uint256 stakingBalance;
    uint256 unstakingBalance;
    uint256 cooldownExpiry;
    string runeAddress;
}
