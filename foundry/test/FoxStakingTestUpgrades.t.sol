// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {MockFoxStakingV2} from "./utils/MockFoxStakingV2.sol";
import {UpgradeHelper} from "./utils/UpgradeHelper.sol";

contract FoxStakingTestUpgrades is Test {
    address public owner = address(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045);
    address public foxStakingProxy;
    FoxStakingV1 public foxStakingV1;
    MockFOXToken public foxToken;

    // NOTE: Do NOT use the FoxStakingTestDeployer, we're testing actual upgrades without the code
    // coverage workaround here.
    UpgradeHelper public upgradeHelper;

    function setUp() public {
        upgradeHelper = new UpgradeHelper();
        foxToken = new MockFOXToken();

        vm.startPrank(owner);
        foxStakingProxy = Upgrades.deployUUPSProxy(
            "FoxStakingV1.sol",
            abi.encodeCall(FoxStakingV1.initialize, (address(foxToken)))
        );
        vm.stopPrank();

        foxStakingV1 = FoxStakingV1(foxStakingProxy);
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
        MockFoxStakingV2 fakeUpgradedFoxStakingV1 = MockFoxStakingV2(
            address(foxStakingV1)
        );
        fakeUpgradedFoxStakingV1.newV2Function();

        // Perform the upgrade
        upgradeHelper.doUpgrade(owner, foxStakingProxy);

        MockFoxStakingV2 foxStakingV2 = MockFoxStakingV2(foxStakingProxy);

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
}
