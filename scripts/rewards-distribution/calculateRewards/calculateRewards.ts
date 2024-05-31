import { Address, Block } from "viem";
import { RFoxLog, StakeLog, UnstakeLog } from "../events";
import { getStakingAmount, isLogType } from "../helpers";
import { REWARD_RATE, WAD } from "../constants";
import assert from "assert";

type StakingInfo = {
  stakingBalance: bigint;
  earnedRewards: bigint;
  rewardPerTokenStored: bigint;
  runeAddress: String;
};

const getEmptyStakingInfo = () => {
  return {
    stakingBalance: 0n,
    earnedRewards: 0n,
    rewardPerTokenStored: 0n,
    runeAddress: "",
  };
};

const rewardPerToken = (
  rewardPerTokenStored: bigint,
  totalStaked: bigint,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  if (totalStaked == 0n) {
    return rewardPerTokenStored;
  }
  return (
    rewardPerTokenStored +
    ((currentTimestamp - lastUpdateTimestamp) * REWARD_RATE * WAD) / totalStaked
  );
};

const earned = (
  stakingInfo: StakingInfo,
  rewardPerTokenStored: bigint,
  totalStaked: bigint,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  return (
    (stakingInfo.stakingBalance *
      (rewardPerToken(
        rewardPerTokenStored,
        totalStaked,
        currentTimestamp,
        lastUpdateTimestamp,
      ) -
        stakingInfo.rewardPerTokenStored)) /
      WAD +
    stakingInfo.earnedRewards
  );
};

const updateReward = (
  stakingInfo: StakingInfo,
  rewardPerTokenStored: bigint,
  totalStaked: bigint,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  rewardPerTokenStored = rewardPerToken(
    rewardPerTokenStored,
    totalStaked,
    currentTimestamp,
    lastUpdateTimestamp,
  );
  lastUpdateTimestamp = currentTimestamp;
  stakingInfo.earnedRewards = earned(
    stakingInfo,
    rewardPerTokenStored,
    totalStaked,
    currentTimestamp,
    lastUpdateTimestamp,
  );
  stakingInfo.rewardPerTokenStored = rewardPerTokenStored;
  return { stakingInfo, rewardPerTokenStored, lastUpdateTimestamp };
};

const stake = (
  amount: bigint,
  runeAddress: String,
  stakingInfo: StakingInfo,
  rewardPerTokenStored: bigint,
  totalStaked: bigint,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  ({ stakingInfo, rewardPerTokenStored, lastUpdateTimestamp } = updateReward(
    stakingInfo,
    rewardPerTokenStored,
    totalStaked,
    currentTimestamp,
    lastUpdateTimestamp,
  ));

  stakingInfo.stakingBalance += amount;
  stakingInfo.runeAddress = runeAddress;
  totalStaked += amount;

  return {
    stakingInfo,
    rewardPerTokenStored,
    lastUpdateTimestamp,
    totalStaked,
  };
};

const unstake = (
  amount: bigint,
  stakingInfo: StakingInfo,
  rewardPerTokenStored: bigint,
  totalStaked: bigint,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  ({ stakingInfo, rewardPerTokenStored, lastUpdateTimestamp } = updateReward(
    stakingInfo,
    rewardPerTokenStored,
    totalStaked,
    currentTimestamp,
    lastUpdateTimestamp,
  ));

  stakingInfo.stakingBalance -= amount;
  totalStaked -= amount;

  return {
    stakingInfo,
    rewardPerTokenStored,
    lastUpdateTimestamp,
    totalStaked,
  };
};

export const calculateRewards = (
  contractCreationBlock: Block,
  // The reward is computed as an all-time value, so we need to subtract the rewards at the end of
  // the previous epoch. This prevents us missing rewards for the first block in the epoch.
  previousEpochEndBlock: Block,
  epochEndBlock: Block,
  logs: { log: RFoxLog; timestamp: bigint }[],
) => {
  let totalStaked = 0n;
  let rewardPerTokenStored = 0n;
  let lastUpdateTimestamp = contractCreationBlock.timestamp;
  const stakingInfoByAccount: Record<Address, StakingInfo> = {};

  const stakingLogs = logs.filter(
    (
      logWithTimestamp,
    ): logWithTimestamp is { log: StakeLog | UnstakeLog; timestamp: bigint } =>
      isLogType("Stake", logWithTimestamp.log) ||
      isLogType("Unstake", logWithTimestamp.log),
  );

  const epochStartRewardsByAccount: Record<Address, bigint> = {};
  const epochEndRewardsByAccount: Record<Address, bigint> = {};

  const previousEpochEndBlockNumber = previousEpochEndBlock.number;
  const epochEndBlockNumber = epochEndBlock.number;

  assert(
    previousEpochEndBlockNumber !== null,
    "Epoch start block number is null",
  );
  assert(epochEndBlockNumber !== null, "Epoch end block number is null");

  let hasCalcedStartRewards = false;

  // process logs
  for (const { log, timestamp: currentTimestamp } of stakingLogs) {
    // Paranoia in case we get logs past the end of the epoch
    assert(log.blockNumber <= epochEndBlockNumber);

    // When the block number passes the start of the epoch, assign the reward values for the start of the epoch
    if (
      !hasCalcedStartRewards &&
      log.blockNumber > previousEpochEndBlockNumber
    ) {
      for (const [account, stakingInfo] of Object.entries(
        stakingInfoByAccount,
      )) {
        epochStartRewardsByAccount[account as Address] = earned(
          stakingInfo,
          rewardPerTokenStored,
          totalStaked,
          previousEpochEndBlock.timestamp,
          lastUpdateTimestamp,
        );

        hasCalcedStartRewards = true;
      }
    }

    let stakingInfo =
      stakingInfoByAccount[log.args.account] ?? getEmptyStakingInfo();

    switch (true) {
      case isLogType<StakeLog>("Stake", log):
        ({
          stakingInfo,
          rewardPerTokenStored,
          lastUpdateTimestamp,
          totalStaked,
        } = stake(
          log.args.amount,
          log.args.runeAddress,
          stakingInfo,
          rewardPerTokenStored,
          totalStaked,
          currentTimestamp,
          lastUpdateTimestamp,
        ));
        break;
      case isLogType<UnstakeLog>("Unstake", log):
        ({
          stakingInfo,
          rewardPerTokenStored,
          lastUpdateTimestamp,
          totalStaked,
        } = unstake(
          log.args.amount,
          stakingInfo,
          rewardPerTokenStored,
          totalStaked,
          currentTimestamp,
          lastUpdateTimestamp,
        ));
        break;
      default:
        break;
    }

    stakingInfoByAccount[log.args.account] = stakingInfo;
  }

  // Grab the reward values for the end of the epoch
  for (const [account, stakingInfo] of Object.entries(stakingInfoByAccount)) {
    epochEndRewardsByAccount[account as Address] = earned(
      stakingInfo,
      rewardPerTokenStored,
      totalStaked,
      epochEndBlock.timestamp,
      lastUpdateTimestamp,
    );
  }

  const earnedRewardsByAccount: Record<Address, bigint> = {};

  for (const [account, epochEndReward] of Object.entries(
    epochEndRewardsByAccount,
  )) {
    earnedRewardsByAccount[account as Address] =
      epochEndReward - (epochStartRewardsByAccount[account as Address] ?? 0n);
  }

  return earnedRewardsByAccount;
};
