// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Upgrades} from "openzeppelin-foundry-upgrades/Upgrades.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./MockFOXToken.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {StakingInfo} from "../src/StakingInfo.sol";

/// @custom:oz-upgrades-from FoxStakingV1
contract MockFoxStakingV2 is
    Initializable,
    PausableUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;
    bool public stakingPaused;
    bool public withdrawalsPaused;
    bool public unstakingPaused;
    uint256 public cooldownPeriod;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external reinitializer(2) {}

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function version() external view returns (uint256) {
        return _getInitializedVersion();
    }

    /// New function in v2
    function newV2Function() public pure returns (string memory) {
        return "new v2 function";
    }
}

contract UpgradeHelper is Test {
    /// @dev Wrapper to perform upgrades pranking the owner. Required to make revert reasons
    /// consistent - otherwise vm.expectRevert actually reverts with a different reason when present
    /// versus when not present.
    /// https://github.com/foundry-rs/foundry/issues/5454
    function doUpgrade(address prankOwner, address proxy) public {
        vm.startPrank(prankOwner);
        Upgrades.upgradeProxy(
            proxy,
            "FoxStakingTestUpgrades.t.sol:MockFoxStakingV2",
            abi.encodeCall(MockFoxStakingV2.initialize, ())
        );
        vm.stopPrank;
    }
}

contract FoxStakingTestUpgrades is Test {
    address public owner = address(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045);
    address public foxStakingProxy;
    FoxStakingV1 public foxStakingV1;
    MockFOXToken public foxToken;
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
