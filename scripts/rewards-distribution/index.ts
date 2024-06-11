import {
  ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
  RUNE_DECIMALS,
} from "./constants";
import { fromBaseUnit, getLogsChunked, toBaseUnit } from "./helpers";
import { publicClient } from "./client";
import { calculateRewards } from "./calculateRewards/calculateRewards";
import { stakingV1Abi } from "./generated/abi-types";
import { validateRewardsDistribution } from "./validation";
import {
  confirmResponses,
  inquireBlockRange,
  inquireTotalRuneAmountToDistroBaseUnit,
} from "./input";
import { distributeAmount } from "./distributeAmount/distributeAmount";
import { Address } from "viem";
import { orderBy } from "lodash";
import { getStakingInfoByAccount } from "./getStakingInfoByAccount";
import { assertValidTotalRuneAllocation } from "./assertValidTotalRuneAllocation/assertValidTotalRuneAllocation";

const main = async () => {
  const [currentBlock, [initLog]] = await Promise.all([
    publicClient.getBlock({
      blockTag: "latest",
    }),
    publicClient.getContractEvents({
      address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
      abi: stakingV1Abi,
      eventName: "Initialized",
      fromBlock: "earliest",
      toBlock: "latest",
    }),
  ]);

  const contractCreationBlockNumber = initLog.blockNumber;
  const currentBlockNumber = currentBlock.number;

  const { epochStartBlockNumber, epochEndBlockNumber } =
    await inquireBlockRange(contractCreationBlockNumber, currentBlockNumber);

  const totalRuneAmountToDistroBaseUnit =
    await inquireTotalRuneAmountToDistroBaseUnit();

  await confirmResponses(
    epochStartBlockNumber,
    epochEndBlockNumber,
    fromBaseUnit(totalRuneAmountToDistroBaseUnit, RUNE_DECIMALS),
  );

  const [previousEpochEndBlock, epochEndBlock] = await Promise.all([
    publicClient.getBlock({
      blockNumber: epochStartBlockNumber - 1n,
    }),
    publicClient.getBlock({
      blockNumber: epochEndBlockNumber,
    }),
  ]);

  const contractCreationBlock = await publicClient.getBlock({
    blockNumber: contractCreationBlockNumber,
  });

  const logs = await getLogsChunked(
    publicClient,
    contractCreationBlockNumber,
    epochEndBlockNumber,
  );

  // sort logs by block number and log index, ascending
  // this is necessary because logs can arrive from RPC out of order
  const orderedLogs = orderBy(
    logs,
    ["blockNumber", "logIndex"],
    ["asc", "asc"],
  );

  const earnedRewardsByAccount = calculateRewards(
    contractCreationBlock,
    previousEpochEndBlock,
    epochEndBlock,
    orderedLogs,
  );

  const accounts = Object.keys(earnedRewardsByAccount) as Address[];
  const epochEndStakingInfoByAccount = await getStakingInfoByAccount(
    publicClient,
    accounts,
    epochEndBlockNumber,
  );

  await validateRewardsDistribution(
    publicClient,
    earnedRewardsByAccount,
    epochStartBlockNumber,
    epochEndBlockNumber,
  );

  console.log("Calculating rewards distribution...");

  // compute the allocation of rewards as a percentage of the totalRuneAmountToDistroBaseUnit
  const runeAllocationBaseUnitByAccount = distributeAmount(
    totalRuneAmountToDistroBaseUnit,
    earnedRewardsByAccount,
  );

  // Validate the sum of the allocations is exactly the total amount
  assertValidTotalRuneAllocation(
    runeAllocationBaseUnitByAccount,
    totalRuneAmountToDistroBaseUnit,
  );

  console.log("Rewards distribution calculated successfully!");

  const tableRows = Object.entries(epochEndStakingInfoByAccount).map(
    ([account, { runeAddress }]) => {
      return {
        account,
        runeAddress,
        runeAllocationBaseUnit:
          runeAllocationBaseUnitByAccount[account as Address],
      };
    },
  );

  console.table(tableRows);
};

main();
