import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { Address, PublicClient } from "viem";
import { ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS } from "./constants";
import { stakingV1Abi } from "./generated/abi-types";
import assert from "assert";

export const validateRewardsDistribution = async (
  publicClient: PublicClient,
  earnedRewardsByAccount: Record<Address, bigint>,
  fromBlock: bigint,
  toBlock: bigint,
) => {
  const progressBar = new cliProgress.SingleBar({
    format:
      "Validation Progress |" +
      colors.cyan("{bar}") +
      "| {percentage}% || {value}/{total} Accounts",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(Object.keys(earnedRewardsByAccount).length, 0, {
    speed: "N/A",
  });

  // validate rewards per account against the contract
  for (const [account, calculatedReward] of Object.entries(
    earnedRewardsByAccount,
  )) {
    const [previousTotalEarnedForAccount, currentTotalEarnedForAccount] =
      await Promise.all([
        publicClient.readContract({
          // TODO: dotenv or similar for contract addresses
          address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
          abi: stakingV1Abi,
          functionName: "earned",
          args: [account as Address],
          blockNumber: fromBlock - 1n, // The end of the previous epoch
        }),
        publicClient.readContract({
          // TODO: dotenv or similar for contract addresses
          address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
          abi: stakingV1Abi,
          functionName: "earned",
          args: [account as Address],
          blockNumber: toBlock,
        }),
      ]);

    const onChainReward =
      currentTotalEarnedForAccount - previousTotalEarnedForAccount;

    assert(
      calculatedReward === onChainReward,
      `Expected reward for ${account} to be ${onChainReward}, got ${calculatedReward}`,
    );

    progressBar.increment();
  }

  progressBar.stop();

  console.log("Validation passed.");
};
