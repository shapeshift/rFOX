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
import { getLatestRuneAddressByAccount } from "./getLatestRuneAddressByAccount";

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

  const { fromBlock, toBlock } = await inquireBlockRange(
    contractCreationBlockNumber,
    currentBlockNumber,
  );

  const totalRuneAmountToDistroBaseUnit =
    await inquireTotalRuneAmountToDistroBaseUnit();

  await confirmResponses(
    fromBlock,
    toBlock,
    fromBaseUnit(totalRuneAmountToDistroBaseUnit, RUNE_DECIMALS),
  );

  const [previousEpochEndBlock, epochEndBlock] = await Promise.all([
    publicClient.getBlock({
      blockNumber: fromBlock - 1n,
    }),
    publicClient.getBlock({
      blockNumber: toBlock,
    }),
  ]);

  const contractCreationBlock = await publicClient.getBlock({
    blockNumber: contractCreationBlockNumber,
  });

  const logs = await getLogsChunked(
    publicClient,
    contractCreationBlockNumber,
    toBlock,
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

  // Get the latest rune address for each account
  const runeAddressByAccount = getLatestRuneAddressByAccount(orderedLogs);

  await validateRewardsDistribution(
    publicClient,
    earnedRewardsByAccount,
    fromBlock,
    toBlock,
  );

  console.log("Calculating rewards distribution...");

  // compute the allocation of rewards as a percentage of the totalRuneAmountToDistroBaseUnit
  const runeAllocationBaseUnitByAccount = distributeAmount(
    totalRuneAmountToDistroBaseUnit,
    earnedRewardsByAccount,
  );

  console.log("Rewards distribution calculated successfully!");

  const tableRows = Object.entries(runeAddressByAccount).map(
    ([account, runeAddress]) => {
      return {
        account,
        runeAddress,
        runeAllocationBaseUnit:
          runeAllocationBaseUnitByAccount[account as Address],
      };
    },
  );

  console.table(tableRows);

  // TODO: Confirm details again before proceeding
};

main();
