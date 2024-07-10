/**
 * Metadata for RFOX staking program (IPFS)
 * @typedef {Object} RFOXMetadata
 * @property {number} epoch - The current epoch number
 * @property {number} epochStartTimestamp - The start timestamp for the current epoch
 * @property {number} epochEndTimestamp - The end timestamp for the current epoch
 * @property {string} treasuryAddress - The treasury address on THORChain used to determine revenue earned by the DAO for RFOX reward distributions and total burn
 * @property {number} distributionRate - The percentage of revenue (in RUNE) accumulated by the treasury to be distributed as rewards
 * @property {number} burnRate - The percentage of revenue (in RUNE) accumulated by the treasury to be used to buy FOX from the open market and subsequently burned
 * @property {Record<number, string>} ipfsHashByEpoch - A record of epoch numbers to their corresponding IPFS hashes
 */
export type RFOXMetadata = {
  /** The current epoch number */
  epoch: number
  /** The start timestamp for the current epoch */
  epochStartTimestamp: number
  /** The end timestamp for the current epoch */
  epochEndTimestamp: number
  /** The current percentage of revenue (RUNE) earned by the treasury to be distributed as rewards */
  distributionRate: number
  /** The current percentage of revenue (RUNE) earned by the treasury to be used to buy FOX from the open market and subsequently burned */
  burnRate: number
  /** The treasury address on THORChain used to determine revenue earned by the DAO for RFOX reward distributions and total burn */
  treasuryAddress: string
  /** A record of epoch number to their corresponding IPFS hashes */
  ipfsHashByEpoch: Record<number, string>
}

/**
 * Details for a single reward distribution
 * @typedef {Object} RewardDistribution
 * @property {string} amount - The amount (RUNE) distributed to the reward address
 * @property {string} rewardUnits - The RFOX staking reward units used to calculate the reward distribution
 * @property {string} txid - The transaction ID (THORChain) for the reward distribution
 * @property {string} rewardAddress - The address (THORChain) used for the reward distribution
 */
export type RewardDistribution = {
  /** The amount (RUNE) distributed to the reward address */
  amount: string
  /** The RFOX staking reward units used to calculate the reward distribution */
  rewardUnits: string
  /** The transaction ID (THORChain) for the reward distribution */
  txId: string
  /** The address used for the reward distribution */
  rewardAddress: string
}

/**
 * Details for a completed epoch (IPFS)
 * @typedef {Object} Epoch
 * @property {number} number - The epoch number for this epoch
 * @property {number} days - The number of days in this epoch
 * @property {number} startBlock - The start block for this epoch
 * @property {number} endBlock - The end block for this epoch
 * @property {string} totalRevenue - The total revenue (RUNE) earned by the treasury for this epoch
 * @property {number} distributionRate - The percentage of revenue (RUNE) accumulated by the treasury to be distributed as rewards for this epoch
 * @property {number} burnRate - The percentage of revenue (RUNE) accumulated by the treasury to be used to buy FOX from the open market and subsequently burned for this epoch
 * @property {Record<number, RewardDistribution>} distributionsByStakingAddress - A record of staking address to distribution for this epoch
 */
export type Epoch = {
  /** The epoch number for this epoch */
  number: number
  /** The start timestamp for this epoch */
  startTimestamp: number
  /** The end timestamp for this epoch */
  endTimestamp: number
  /** The start block for this epoch */
  startBlock: number
  /** The end block for this epoch */
  endBlock: number
  /** The total revenue (RUNE) earned by the treasury for this epoch */
  totalRevenue: string
  /** The total RFOX staking reward units for this epoch */
  totalRewardUnits: string
  /** The percentage of revenue (RUNE) accumulated by the treasury to be distributed as rewards for this epoch */
  distributionRate: number
  /** The percentage of revenue (RUNE) accumulated by the treasury to be used to buy FOX from the open market and subsequently burned for this epoch */
  burnRate: number
  /** The treasury address on THORChain used to determine revenue earned by the DAO for RFOX reward distributions and total burn */
  treasuryAddress: string
  /** A record of staking address to reward distribution for this epoch */
  distributionsByStakingAddress: Record<string, RewardDistribution>
}
