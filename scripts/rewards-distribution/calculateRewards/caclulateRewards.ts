import { Address } from "viem";
import { RFoxLog, StakeLog, UnstakeLog } from "../events";
import { getStakingAmount, isLogType } from "../helpers";

export const calculateRewards = (
  fromBlock: bigint,
  toBlock: bigint,
  logsByBlockNumber: Record<string, RFoxLog[]>,
  epochBlockReward: bigint,
  totalStaked: bigint,
) => {
  const balanceByAccountBaseUnit: Record<Address, bigint> = {};

  // this must be initialized to empty
  const epochRewardByAccount: Record<Address, bigint> = {};

  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
    const incomingLogs: RFoxLog[] =
      logsByBlockNumber[blockNumber.toString()] ?? [];

    const stakingLogs = incomingLogs.filter(
      (log): log is StakeLog | UnstakeLog =>
        isLogType("Stake", log) || isLogType("Unstake", log),
    );

    // process logs if there are any
    for (const log of stakingLogs) {
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

    for (const account of Object.keys(balanceByAccountBaseUnit) as Address[]) {
      // calculate rewards for the current block
      const reward =
        totalStaked > 0n
          ? (epochBlockReward * balanceByAccountBaseUnit[account]) / totalStaked
          : 0n;

      if (epochRewardByAccount[account] == undefined) {
        epochRewardByAccount[account] = 0n;
      }
      epochRewardByAccount[account] += reward;
    }
  }

  return epochRewardByAccount;
};
