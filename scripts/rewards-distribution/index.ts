import { Address } from "viem";
import { StakeLog, UnstakeLog, stakeEvent, unstakeEvent } from "./events";
import { assertUnreachable } from "./helpers";
import { simulateStaking } from "./simulateStaking";
import { localPublicClient } from "./constants";
import { assert } from "console";

const getStakingLogs = async ({
  fromBlock,
  toBlock,
}: {
  fromBlock: bigint;
  toBlock: bigint;
}) => {
  const logs = await localPublicClient.getLogs({
    events: [stakeEvent, unstakeEvent],
    fromBlock,
    toBlock,
  });
  return logs;
};

const getStakingAmount = (log: StakeLog | UnstakeLog): bigint => {
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

// get the epoch and block reward for a given block number
// TODO: this is a placeholder function matching the spreadsheet logic
const getEpochBlockReward = (_epochEndBlockNumber: bigint) => {
  // TODO: blockReward is calculated as half the total rune earned by the DAO divided by the number of blocks in the epoch
  return 10n;
};

// get the block range for the current epoch
const getEpochBlockRange = () => {
  // Monkey-patched to 0 and 5 for testing for now since the current simulation only goes up to block 5
  const previousEpochEndBlockNumber = 0n;
  const currentBlockNumber = 500n;
  return {
    fromBlock: previousEpochEndBlockNumber,
    toBlock: currentBlockNumber,
  };
};

// TODO: this should only process 1 epoch at a time
const main = async () => {
  await simulateStaking();

  // iterate all blocks for the current epoch
  const { fromBlock, toBlock } = getEpochBlockRange();

  // Grab the first 500 or so blocks so we can simulate rewards distribution without worrying about how many blocks elapsed during contract deployment
  const logs = await getStakingLogs({ fromBlock, toBlock });
  // index logs by block number
  const logsByBlockNumber = logs.reduce<Record<string, any[]>>((acc, log) => {
    if (!acc[log.blockNumber.toString()]) {
      acc[log.blockNumber.toString()] = [];
    }
    acc[log.blockNumber.toString()].push(log);
    return acc;
  }, {});

  // TODO: these will be initialized from the last epoch's state
  let totalStaked = 0n;
  const balanceByAccountBaseUnit: Record<Address, bigint> = {};

  // this must be initialized to empty
  const epochRewardByAccount: Record<Address, number> = {};

  const epochBlockReward = getEpochBlockReward(toBlock);

  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
    const incomingLogs: (StakeLog | UnstakeLog)[] | undefined =
      logsByBlockNumber[blockNumber.toString()];

    // process logs if there are any
    if (incomingLogs !== undefined) {
      for (const log of incomingLogs) {
        const account = log.args.account;
        if (!balanceByAccountBaseUnit[account]) {
          balanceByAccountBaseUnit[account] = 0n;
        }
        const stakingAmountBaseUnit = getStakingAmount(log);
        balanceByAccountBaseUnit[account] += stakingAmountBaseUnit;
        totalStaked += stakingAmountBaseUnit;

        // clear empty balances
        if (balanceByAccountBaseUnit[account] === 0n) {
          delete balanceByAccountBaseUnit[account];
        }
      }
    }

    for (const account of Object.keys(balanceByAccountBaseUnit) as Address[]) {
      // calculate rewards for the current block
      // TODO: Bignumber math should be used here to allow for more precision with floating point numbers
      const proportionOfTotalStaked =
        totalStaked > 0n
          ? Number(balanceByAccountBaseUnit[account]) / Number(totalStaked)
          : 0;
      const reward = Number(epochBlockReward) * proportionOfTotalStaked;

      if (epochRewardByAccount[account] == undefined) {
        epochRewardByAccount[account] = 0;
      }
      epochRewardByAccount[account] += reward;
    }
  }

  console.log("rewards to be distributed:");
  console.log(epochRewardByAccount);
};

main();
