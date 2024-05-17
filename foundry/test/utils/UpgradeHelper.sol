// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {StakingV1} from "../../src/StakingV1.sol";
import {MockStakingV2} from "./MockStakingV2.sol";

contract UpgradeHelper is Test {
    /// @dev Wrapper to perform upgrades pranking the owner. Required to make revert reasons
    /// consistent - otherwise vm.expectRevert actually reverts with a different reason when present
    /// versus when not present.
    /// https://github.com/foundry-rs/foundry/issues/5454
    function doUpgrade(address prankOwner, address proxy) public {
        vm.startPrank(prankOwner);
        Upgrades.upgradeProxy(
            proxy,
            "MockStakingV2.sol:MockStakingV2",
            abi.encodeCall(MockStakingV2.initialize, ())
        );
        vm.stopPrank;
    }
}
