import { Address, parseAbiItem } from "viem";
import { StakingLog } from "./events.ts";
import { assertUnreachable } from "./helpers.ts";
import { simulateStaking } from "./simulateStaking.ts";
import { localPublicClient } from "./constants.ts";

const getLogs = async ({
  fromBlock,
  toBlock,
}: {
  fromBlock: bigint;
  toBlock: bigint;
}) => {
  const logs = await localPublicClient.getLogs({
    // address: '0x'
    events: [
      parseAbiItem(
        "event Stake(address indexed account, uint256 amount, string runeAddress)",
      ),
      parseAbiItem("event Unstake(address indexed user, uint256 amount)"),
    ],
    fromBlock,
    toBlock,
  });
  return logs as StakingLog[];
};

const getStakingAmount = (log: StakingLog): bigint => {
  switch (log.eventName) {
    case "Stake":
      return log.args.amount;
    case "Unstake":
      return -BigInt(log.args.amount);
    default:
      assertUnreachable(log.eventName);
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
  const currentBlockNumber = 5n;
  return {
    fromBlockNumber: previousEpochEndBlockNumber,
    toBlockNumber: currentBlockNumber,
  };
};

// TODO: this should only process 1 epoch at a time
const main = async () => {
  await simulateStaking();
  // While testing, and with the current simulation flow we only need logs from block 1 to 5 but this may change
  const logs = await getLogs({ fromBlock: 0n, toBlock: 5n });
  // index logs by block number
  const logsByBlockNumber = logs.reduce<Record<string, StakingLog[]>>(
    (acc, log) => {
      if (!acc[log.blockNumber.toString()]) {
        acc[log.blockNumber.toString()] = [];
      }
      acc[log.blockNumber.toString()].push(log);
      return acc;
    },
    {},
  );

  // TODO: these will be initialized from the last epoch's state
  let totalStaked = 0n;
  const balanceByAccountBaseUnit: Record<Address, bigint> = {};

  // this must be initialized to empty
  const epochRewardByAccount: Record<Address, number> = {};

  // iterate all blocks for the current epoch
  const { fromBlockNumber, toBlockNumber } = getEpochBlockRange();

  const epochBlockReward = getEpochBlockReward(toBlockNumber);

  for (
    let blockNumber = fromBlockNumber;
    blockNumber <= toBlockNumber;
    blockNumber++
  ) {
    const incomingLogs: StakingLog[] | undefined =
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
