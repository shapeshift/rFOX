// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {FoxStakingV1} from "../src/FoxStakingV1.sol";
import {MockFOXToken} from "./utils/MockFOXToken.sol";
import {FoxStakingTestDeployer} from "./utils/FoxStakingTestDeployer.sol";

contract FOXStakingTestRuneAddress is Test {
    FoxStakingTestDeployer public deployer;
    FoxStakingV1 public foxStaking;
    MockFOXToken public foxToken;
    address user = address(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045);

    function setUp() public {
        foxToken = new MockFOXToken();
        deployer = new FoxStakingTestDeployer();
        address proxyAddress = deployer.deployV1(
            address(this),
            address(foxToken)
        );
        foxStaking = FoxStakingV1(proxyAddress);
    }

    function testCanSetRuneAddress() public {
        vm.startPrank(user);

        string
            memory newRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

        foxStaking.setRuneAddress(newRuneAddress);

        (, , string memory runeAddress) = foxStaking.stakingInfo(user);
        assertEq(
            runeAddress,
            newRuneAddress,
            "setRuneAddress should update the rune address when called by the owner"
        );

        vm.stopPrank();
    }

    function testCannotSetInvalidLengthRuneAddress() public {
        vm.startPrank(user);

        string memory invalidLengthRuneAddress = "thor1234";

        vm.expectRevert("Rune address must be 43 characters");
        foxStaking.setRuneAddress(invalidLengthRuneAddress);

        vm.stopPrank();
    }

    function cannotStakeWithEmptyRuneAddress() public {
        vm.startPrank(user);

        string memory emptyRuneAddress = "";

        vm.expectRevert("Rune address cannot be empty");
        foxStaking.stake(1e18, emptyRuneAddress);

        vm.stopPrank();
    }

    function cannotStakeWithInvalidLengthRuneAddress() public {
        vm.startPrank(user);

        string memory invalidLengthRuneAddress = "thor1234";

        vm.expectRevert("Rune address must be 42 characters");
        foxStaking.stake(1e18, invalidLengthRuneAddress);

        vm.stopPrank();
    }
}
