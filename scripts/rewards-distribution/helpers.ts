import BigNumber from "bignumber.js";
import {
  ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
  GET_LOGS_BLOCK_STEP_SIZE,
} from "./constants";
import { AbiEvent, Log, PublicClient } from "viem";
import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { RFoxLog, StakeLog, UnstakeLog } from "./events";
import { stakingV1Abi } from "./generated/abi-types";

// we cache promises to prevent async race conditions hydrating the cache
const blockNumberToTimestampCache: Record<string, Promise<bigint>> = {};

export const getBlockTimestamp = async (
  publicClient: PublicClient,
  blockNumber: bigint,
): Promise<bigint> => {
  if (blockNumberToTimestampCache[blockNumber.toString()] !== undefined) {
    return blockNumberToTimestampCache[blockNumber.toString()];
  }

  const timestampPromise = publicClient
    .getBlock({ blockNumber })
    .then((block) => block.timestamp);

  blockNumberToTimestampCache[blockNumber.toString()] = timestampPromise;

  return timestampPromise;
};

export const assertUnreachable = (x: never): never => {
  throw Error(`unhandled case: ${x}`);
};

export const toBaseUnit = (
  amountPrecision: number,
  decimals: number,
): bigint => {
  const amountBaseUnit = BigInt(
    new BigNumber(amountPrecision)
      .times(BigNumber(10).pow(decimals))
      .toFixed(0),
  );

  return amountBaseUnit;
};

export const fromBaseUnit = (
  amountBaseUnit: bigint,
  decimals: number,
): number => {
  return new BigNumber(amountBaseUnit.toString())
    .div(BigNumber(10).pow(decimals))
    .toNumber();
};

// Get logs from the blockchain in chunks
export const getLogsChunked = async (
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ log: RFoxLog; timestamp: bigint }[]> => {
  const logs = [];

  const progressBar = new cliProgress.SingleBar({
    format:
      "Fetch Logs Progress |" +
      colors.cyan("{bar}") +
      "| {percentage}% || {value}/{total} Pages",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(
    Math.ceil(Number(toBlock - fromBlock) / Number(GET_LOGS_BLOCK_STEP_SIZE)),
    0,
    {
      speed: "N/A",
    },
  );

  let fromBlockInner = fromBlock;

  while (fromBlockInner < toBlock) {
    let toBlockInner = fromBlockInner + GET_LOGS_BLOCK_STEP_SIZE;

    // Limit toBlockInner to toBlock so we never go past the upper range
    if (toBlockInner > toBlock) {
      toBlockInner = toBlock;
    }

    const logsChunk = await publicClient.getContractEvents({
      address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
      abi: stakingV1Abi,
      fromBlock: fromBlockInner,
      toBlock: toBlockInner,
    });

    // Attach the block timestamp for each log
    /**
      TEMP: Free-tier rate limiting means we cant do a promise.all here
      const logsChunkWithTimestamp: { log: RFoxLog; timestamp: bigint }[] =
        await Promise.all(
          logsChunk.map(async (log) => {
            const timestamp = await getBlockTimestamp(
              publicClient,
              log.blockNumber,
            );
            return {
              log: log as RFoxLog,
              timestamp,
            };
          }),
        );
      */
    const logsChunkWithTimestamp: { log: RFoxLog; timestamp: bigint }[] = [];
    for (const log of logsChunk) {
      const timestamp = await getBlockTimestamp(publicClient, log.blockNumber);
      logsChunkWithTimestamp.push({
        log: log as RFoxLog,
        timestamp,
      });
    }

    logs.push(...logsChunkWithTimestamp);

    progressBar.increment();

    fromBlockInner = toBlockInner;
  }

  progressBar.stop();

  return logs;
};

export const indexBy = <T, K extends keyof T>(values: T[], key: K) => {
  return values.reduce(
    (acc, value) => {
      const innerKey = `${value[key]}`;
      if (!acc[innerKey]) {
        acc[innerKey] = [];
      }
      acc[innerKey].push(value);
      return acc;
    },
    {} as Record<string, T[]>,
  );
};

export const isEventType = <Event extends AbiEvent>(
  name: Event["name"],
  event: AbiEvent,
): event is Event => {
  return event.name === name;
};

export const isLogType = <L extends RFoxLog>(
  eventName: L["eventName"],
  log: Log,
): log is L => {
  return (log as L).eventName === eventName;
};

export const getStakingAmount = (log: StakeLog | UnstakeLog): bigint => {
  const eventName = log.eventName;
  switch (eventName) {
    case "Stake":
      return log.args.amount;
    case "Unstake":
      return -log.args.amount;
    default:
      assertUnreachable(eventName);
  }

  throw Error("should be unreachable");
};
