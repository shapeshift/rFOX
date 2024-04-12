// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestOwnership is Test {
    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;
    address nonOwner = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045;

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);
    }

    function testOwnerCanUpdateCooldownPeriod() public {
        uint256 newCooldownPeriod = 14 days;

        foxStaking.setCooldownPeriod(newCooldownPeriod);
        assertEq(
            foxStaking.cooldownPeriod(),
            newCooldownPeriod,
            "setCooldownPeriod should update the cooldown period when called by the owner"
        );
    }

    function testNonOwnerCannotUpdateCooldownPeriod() public {
        uint256 newCooldownPeriod = 7 days;

        vm.prank(nonOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                address(nonOwner)
            )
        );
        foxStaking.setCooldownPeriod(newCooldownPeriod);
    }
}
