// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {FoxStakingV1} from "../../src/FoxStakingV1.sol";
import {MockFoxStakingV2} from "./MockFoxStakingV2.sol";

contract UpgradeHelper is Test {
    /// @dev Wrapper to perform upgrades pranking the owner. Required to make revert reasons
    /// consistent - otherwise vm.expectRevert actually reverts with a different reason when present
    /// versus when not present.
    /// https://github.com/foundry-rs/foundry/issues/5454
    function doUpgrade(address prankOwner, address proxy) public {
        vm.startPrank(prankOwner);
        Upgrades.upgradeProxy(
            proxy,
            "MockFoxStakingV2.sol:MockFoxStakingV2",
            abi.encodeCall(MockFoxStakingV2.initialize, ())
        );
        vm.stopPrank;
    }
}
