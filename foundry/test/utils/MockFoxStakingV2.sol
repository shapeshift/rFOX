// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {StakingInfo} from "../../src/StakingInfo.sol";

/// @custom:oz-upgrades-from FoxStakingV1
contract MockFoxStakingV2 is
    Initializable,
    PausableUpgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    IERC20 public foxToken;
    mapping(address => StakingInfo) public stakingInfo;
    bool public stakingPaused;
    bool public withdrawalsPaused;
    bool public unstakingPaused;
    uint256 public cooldownPeriod;

    uint256 public totalStaked;
    uint256 public totalCoolingDown;

    uint256 public constant REWARD_RATE = 1_000_000_000;
    uint256 public constant WAD = 1e18;
    uint256 public lastUpdateTimestamp;
    uint256 public rewardPerTokenStored;

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
