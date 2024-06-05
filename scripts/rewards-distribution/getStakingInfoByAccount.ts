import { Address, PublicClient } from "viem";
import { stakingV1Abi } from "./generated/abi-types";
import { ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS } from "./constants";
import { StakingInfo } from "./types";

export const getStakingInfoByAccount = async (
  publicClient: PublicClient,
  accounts: Address[],
  blockNumber: bigint,
) => {
  const runeAddressByAccount: Record<Address, StakingInfo> = {};

  // Note we need to query these sequentially until we have higher rate limits
  // TODO: Promise.all when we have higher rate limits
  for (const account of accounts) {
    const [
      stakingBalance,
      unstakingBalance,
      earnedRewards,
      rewardPerTokenStored,
      runeAddress,
    ] = await publicClient.readContract({
      // TODO: dotenv or similar for contract addresses
      address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
      abi: stakingV1Abi,
      functionName: "stakingInfo",
      args: [account],
      blockNumber,
    });

    runeAddressByAccount[account] = {
      stakingBalance,
      unstakingBalance,
      earnedRewards,
      rewardPerTokenStored,
      runeAddress,
    };
  }

  return runeAddressByAccount;
};
