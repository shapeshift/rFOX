import BigNumber from "bignumber.js";
import { GET_LOGS_BLOCK_STEP_SIZE } from "./constants";
import { AbiEvent, Log, PublicClient } from "viem";
import { RFoxEvent, RFoxLog, StakeLog, UnstakeLog } from "./events";

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
export const getLogsChunked = async <E extends readonly RFoxEvent[]>(
  publicClient: PublicClient,
  events: E,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RFoxLog[]> => {
  const logs = [];
  let fromBlockInner = fromBlock;
  while (fromBlockInner < toBlock) {
    let toBlockInner = fromBlock + GET_LOGS_BLOCK_STEP_SIZE;

    // Limit toBlockInner to toBlock so we never go past the upper range
    if (toBlockInner > toBlock) {
      toBlockInner = toBlock;
    }

    const logsChunk = await publicClient.getLogs({
      events,
      fromBlock: fromBlockInner,
      toBlock: toBlockInner,
    });

    logs.push(...(logsChunk as RFoxLog[]));

    // Set fromBlockInner toBlockInner + 1 so we don't double fetch that block
    fromBlockInner = toBlockInner + 1n;
  }
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
