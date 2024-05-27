import BigNumber from "bignumber.js";
import { GET_LOGS_BLOCK_STEP_SIZE } from "./constants";
import { AbiEvent, PublicClient } from "viem";

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
  events: readonly AbiEvent[],
  fromBlock: bigint,
  toBlock: bigint,
) => {
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

    logs.push(...logsChunk);

    // Set fromBlockInner toBlockInner + 1 so we don't double fetch that block
    fromBlockInner = toBlockInner + 1n;
  }
  return logs;
};
