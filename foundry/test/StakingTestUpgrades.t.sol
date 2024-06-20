// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {StakingV1} from "../src/StakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {MockStakingV2} from "./utils/MockStakingV2.sol";
import {UpgradeHelper} from "./utils/UpgradeHelper.sol";

contract FoxStakingTestUpgrades is Test {
    address public owner = address(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045);
    address public foxStakingProxy;
    StakingV1 public foxStakingV1;
    MockFOXToken public foxToken;

    // NOTE: Do NOT use the StakingTestDeployer, we're testing actual upgrades without the code
    // coverage workaround here.
    UpgradeHelper public upgradeHelper;

    function setUp() public {
        upgradeHelper = new UpgradeHelper();
        foxToken = new MockFOXToken();

        vm.startPrank(owner);
        foxStakingProxy = Upgrades.deployUUPSProxy(
            "StakingV1.sol",
            abi.encodeCall(StakingV1.initialize, (address(foxToken)))
        );
        vm.stopPrank();

        foxStakingV1 = StakingV1(foxStakingProxy);
    }

    function testDeployerIsOwner() public view {
        assertEq(Ownable(foxStakingProxy).owner(), owner);
    }

    function testOwnerCanUpgrade() public {
        // Check the current version
        uint256 expectedCurrentVersion = 1;
        assertEq(foxStakingV1.version(), expectedCurrentVersion);

        // Check we cannot call the new function
        vm.expectRevert();
        MockStakingV2 fakeUpgradedStakingV1 = MockStakingV2(
            address(foxStakingV1)
        );
        fakeUpgradedStakingV1.newV2Function();

        // Perform the upgrade
        upgradeHelper.doUpgrade(owner, foxStakingProxy);

        MockStakingV2 foxStakingV2 = MockStakingV2(foxStakingProxy);

        // Check the new version
        uint256 expectedUpgradedVersion = 2;
        assertEq(foxStakingV2.version(), expectedUpgradedVersion);

        // Check we can call the new function
        string memory result = foxStakingV2.newV2Function();
        assertEq(result, "new v2 function");
    }

    function testNonOwnerCannotUpgrade() public {
        // Check the current version
        uint256 expectedCurrentVersion = 1;
        assertEq(foxStakingV1.version(), expectedCurrentVersion);

        address nonOwner = address(0xBADD1E);

        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                address(nonOwner)
            )
        );

        // Attempt to perform the upgrade, but as a non-owner
        upgradeHelper.doUpgrade(nonOwner, foxStakingProxy);
    }

    function testChangeOwnerAndUpgrade() public {
        // Check the current version
        uint256 expectedCurrentVersion = 1;
        assertEq(foxStakingV1.version(), expectedCurrentVersion);

        address newOwner = address(0x0FF1CE);

        // confirm the new owner cannot upgrade yet!
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                address(newOwner)
            )
        );

        // Attempt to perform the upgrade, but as a non-owner
        upgradeHelper.doUpgrade(newOwner, foxStakingProxy);

        // confrim still on old version
        assertEq(foxStakingV1.version(), expectedCurrentVersion);

        // Change the owner
        vm.startPrank(owner);
        foxStakingV1.transferOwnership(newOwner);
        vm.stopPrank();

        // Check the new owner
        assertEq(Ownable(foxStakingProxy).owner(), newOwner);

        // Perform the upgrade
        upgradeHelper.doUpgrade(newOwner, foxStakingProxy);

        MockStakingV2 foxStakingV2 = MockStakingV2(foxStakingProxy);

        // Check the new version
        uint256 expectedUpgradedVersion = 2;
        assertEq(foxStakingV2.version(), expectedUpgradedVersion);

        // Check we can call the new function
        string memory result = foxStakingV2.newV2Function();
        assertEq(result, "new v2 function");
    }
}
