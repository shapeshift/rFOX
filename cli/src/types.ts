import { Address } from 'viem'

/**
 * Metadata for rFOX staking program (IPFS)
 * @typedef {Object} RFOXMetadata
 * @property {number} epoch - The current epoch number
 * @property {number} epochStartTimestamp - The start timestamp for the current epoch
 * @property {number} epochEndTimestamp - The end timestamp for the current epoch
 * @property {number} burnRate - The current percentage of revenue to be used to buy FOX from the open market and subsequently burned
 * @property {number} distributionRateByStakingContract - The current percentage of revenue to be distributed as rewards for each staking contract
 * @property {Record<string, string>} ipfsHashByEpoch - The IPFS hashes for each epoch
 */
export type RFOXMetadata = {
  /** The current epoch number */
  epoch: number
  /** The start timestamp for the current epoch */
  epochStartTimestamp: number
  /** The end timestamp for the current epoch */
  epochEndTimestamp: number
  /** The current percentage of revenue to be used to buy FOX from the open market and subsequently burned */
  burnRate: number
  /** The current percentage of revenue to be distributed as rewards for each staking contract */
  distributionRateByStakingContract: Record<string, number>
  /** The IPFS hashes for each epoch */
  ipfsHashByEpoch: Record<string, string>
}

/**
 * Details for a single reward distribution (IPFS)
 * @typedef {Object} RewardDistribution
 * @property {string} amount - The amount (reward asset) distributed to the reward address
 * @property {string} rewardUnits - The rFOX staking reward units earned for the current epoch
 * @property {string} totalRewardUnits - The total rFOX staking reward units earned across all epochs
 * @property {string} txid - The transaction ID for the reward distribution
 * @property {string} rewardAddress - The address used for the reward distribution
 */
export type RewardDistribution = {
  /** The amount (reward asset) distributed to the reward address */
  amount: string
  /** The rFOX staking reward units earned for the current epoch */
  rewardUnits: string
  /** The total rFOX staking reward units earned across all epochs */
  totalRewardUnits: string
  /** The transaction ID for the reward distribution */
  txId: string
  /** The address used for the reward distribution */
  rewardAddress: string
}

/**
 * Details for a completed epoch (IPFS)
 * @typedef {Object} Epoch
 * @property {number} number - The epoch number for this epoch
 * @property {number} startTimestamp - The start timestamp for this epoch
 * @property {number} endTimestamp - The end timestamp for this epoch
 * @property {number} startBlock - The start block for this epoch
 * @property {number} endBlock - The end block for this epoch
 * @property {string} totalRevenue - The total revenue (USD) earned this epoch
 * @property {Record<string, string>} revenue - The revenue (USD) earned (by service) for this epoch
 * @property {number} burnRate - The percentage of revenue to be used to buy FOX from the open market and subsequently burned for this epoch
 * @property {string} rewardAssetPriceUsd - The spot price of reward asset in USD
 * @property {'pending' | 'complete'} distributionStatus - The status of the reward distribution
 * @property {Record<string, EpochDetails>} detailsByStakingAddress - The details for each staking contract for this epoch
 */
export type Epoch = {
  /** The epoch number for this epoch */
  number: number
  /** The start timestamp for this epoch */
  startTimestamp: number
  /** The end timestamp for this epoch */
  endTimestamp: number
  /** The timestamp of the pending or complete reward distribution */
  distributionTimestamp: number
  /** The start block for this epoch */
  startBlock: number
  /** The end block for this epoch */
  endBlock: number
  /** The total revenue (USD) earned this epoch */
  totalRevenue: string
  /** The revenue (USD) earned (by service) for this epoch */
  revenue: Record<string, string>
  /** The percentage of revenue to be used to buy FOX from the open market and subsequently burned for this epoch */
  burnRate: number
  /** The spot price of reward asset in USD */
  rewardAssetPriceUsd: string
  /** The status of the reward distribution */
  distributionStatus: 'pending' | 'complete'
  /** The details for each staking contract for this epoch */
  detailsByStakingContract: Record<string, EpochDetails>
}

/**
 * Epoch details for a staking contract (IPFS)
 * @typedef {Object} EpochDetails
 * @property {number} totalRewardUnits - The total rFOX staking reward units for this epoch
 * @property {number} distributionRate - The percentage of revenue to be distributed as rewards for this epoch
 * @property {string} assetPriceUsd - The spot price of asset in USD
 * @property {Record<string, RewardDistribution>} distributionsByStakingAddress - The reward distribution for each staking address for this epoch
 */
export type EpochDetails = {
  /** The total rFOX staking reward units for this epoch */
  totalRewardUnits: string
  /** The percentage of revenue to be distributed as rewards for this epoch */
  distributionRate: number
  /** The spot price of asset in USD */
  assetPriceUsd: string
  /** The reward distribution for each staking address for this epoch */
  distributionsByStakingAddress: Record<string, RewardDistribution>
}

export type CalculateRewardsArgs = {
  stakingContract: Address
  startBlock: bigint
  endBlock: bigint
  secondsInEpoch: bigint
  distributionRate: number
  totalRevenue: string
}
