// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {FoxStakingV1} from "../../src/FoxStakingV1.sol";
import {MockFoxStakingV2} from "./MockFoxStakingV2.sol";
import {console2} from "forge-std/Test.sol";

/// @notice This contract is used to deploy the FoxStaking contract for testing purposes only.
/// This is a workaround for an issue with the OpenZeppelin Upgrades Plugins breaking code coverage
/// reporting with proxies:
/// https://github.com/OpenZeppelin/openzeppelin-foundry-upgrades/issues/2
contract FoxStakingTestDeployer is Test {
    function deployV1(
        address owner,
        address foxTokenAddress
    ) public returns (address) {
        vm.startPrank(owner);
        FoxStakingV1 implementation = new FoxStakingV1();
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), "");
        FoxStakingV1(address(proxy)).initialize(foxTokenAddress);
        vm.stopPrank();

        return address(proxy);
    }
}
