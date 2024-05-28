import { prompt, type QuestionCollection } from "inquirer";
import {
  ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
  RUNE_DECIMALS,
} from "./constants";
import { fromBaseUnit, getLogsChunked, indexBy, toBaseUnit } from "./helpers";
import { publicClient } from "./client";
import { rFoxEvents } from "./events";
import { calculateRewards } from "./calculateRewards/calculateRewards";
import { stakingV1Abi } from "./generated/abi-types";
import assert from "assert";

const inquireBlockRange = async (): Promise<{
  fromBlock: bigint;
  toBlock: bigint;
}> => {
  const questions: QuestionCollection<{
    fromBlock: number;
    toBlock: number;
  }> = [
    {
      type: "number",
      name: "fromBlock",
      message: "What is the START block number of this epoch?",
      default: 215722218, // TODO: remove this default
    },
    {
      type: "number",
      name: "toBlock",
      message: "What is the END block number of this epoch?",
      default: 215722586, // TODO: remove this default
    },
  ];

  const { fromBlock, toBlock } = await prompt(questions);
  assert(fromBlock < toBlock, "Start block must be less than end block");
  return { fromBlock: BigInt(fromBlock), toBlock: BigInt(toBlock) };
};

const inquireTotalRuneAmountToDistroBaseUnit = async (): Promise<bigint> => {
  const questions: QuestionCollection<{ totalRuneAmountPrecision: number }> = [
    {
      type: "number",
      name: "totalRuneAmountPrecision",
      message:
        "What is the total amount of RUNE to distribute this epoch? Enter this amount in RUNE, not in base units (RUNE*10^8).",
    },
  ];

  const { totalRuneAmountPrecision } = await prompt(questions);
  console.log(totalRuneAmountPrecision);
  const totalRuneAmountBaseUnit = toBaseUnit(
    totalRuneAmountPrecision,
    RUNE_DECIMALS,
  );

  return totalRuneAmountBaseUnit;
};

const confirmResponses = async (
  fromBlock: bigint,
  toBlock: bigint,
  totalRuneAmountToDistroBaseUnit: number,
) => {
  const questions: QuestionCollection<{ confirm: boolean }> = [
    {
      type: "confirm",
      name: "confirm",
      message: [
        "Do you want to proceed with these values?",
        `* Start block: ${fromBlock}`,
        `* End block: ${toBlock}`,
        `* Total RUNE to distribute: ${totalRuneAmountToDistroBaseUnit} RUNE`,
      ].join("\n"),
    },
  ];

  const { confirm } = await prompt(questions);

  if (!confirm) {
    console.log("Exiting...");
    process.exit(0);
  }
};

const main = async () => {
  const { fromBlock, toBlock } = await inquireBlockRange();

  const totalRuneAmountToDistroBaseUnit =
    await inquireTotalRuneAmountToDistroBaseUnit();

  await confirmResponses(
    fromBlock,
    toBlock,
    fromBaseUnit(totalRuneAmountToDistroBaseUnit, RUNE_DECIMALS),
  );

  const totalStaked = await publicClient.readContract({
    // TODO: dotenv or similar for contract addresses
    address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
    abi: stakingV1Abi,
    functionName: "totalStaked",
    args: [],
    blockNumber: toBlock,
  });

  const epochBlockReward = await publicClient.readContract({
    // TODO: dotenv or similar for contract addresses
    address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
    abi: stakingV1Abi,
    functionName: "rewardPerToken",
    args: [],
    blockNumber: toBlock,
  });

  const logs = await getLogsChunked(
    publicClient,
    rFoxEvents,
    fromBlock,
    toBlock,
  );

  const logsByBlockNumber = indexBy(logs, "blockNumber");

  const epochRewardByAccount = calculateRewards(
    fromBlock,
    toBlock,
    logsByBlockNumber,
    epochBlockReward,
    totalStaked,
  );

  console.log("rewards to be distributed:");
  console.log(epochRewardByAccount);

  // TODO: Confirm details again before proceeding
};

main();
