// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import {MockFOXToken} from "../test/utils/MockFOXToken.sol";

contract DeployMockFoxToken is Script {
    function run() public {
        vm.startBroadcast();
        MockFOXToken mockFoxToken = new MockFOXToken();
        vm.stopBroadcast();

        console.log("Contract deployed at:", address(mockFoxToken));
    }
}
