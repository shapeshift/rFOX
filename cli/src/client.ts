import * as prompts from '@inquirer/prompts'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import ora, { Ora } from 'ora'
import { Address, PublicClient, createPublicClient, getContract, http, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'
import { stakingV1Abi } from '../generated/abi'
import {
  ETHEREUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX,
  ETHEREUM_RFOX_PROXY_CONTRACT_DEPLOYMENT_BLOCK,
  RFOX_REWARD_RATE,
} from './constants'
import { error, info, warn } from './logging'
import { CalculateRewardsArgs, RewardDistribution } from './types'

const ALCHEMY_API_KEY = process.env['ALCHEMY_API_KEY']
if (!ALCHEMY_API_KEY) {
  error('ALCHEMY_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

export const stakingContracts = [ETHEREUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]

type Revenue = {
  totalUsd: number
  byService: Record<string, number>
}

type Price = {
  assetPriceUsd: Record<string, string>
  rewardAssetPriceUsd: string
}

type ClosingState = {
  rewardUnits: bigint
  totalRewardUnits: bigint
  rewardAddress: string
}

type ClosingStateByStakingAddress = Record<string, ClosingState>

export class Client {
  private rpc: PublicClient

  constructor() {
    this.rpc = createPublicClient({
      chain: mainnet,
      transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
    })
  }

  static async new(): Promise<Client> {
    return new Client()
  }

  async getBlockByTimestamp(targetTimestamp: bigint, blockMode: 'earliest' | 'latest', spinner?: Ora): Promise<bigint> {
    try {
      const finalizedBlock = await this.rpc.getBlock({ blockTag: 'finalized' })

      if (finalizedBlock.timestamp <= targetTimestamp) {
        spinner?.fail()
        error(`Block is not finalized for target timestamp: ${targetTimestamp.toString()}, exiting.`)
        process.exit(1)
      }

      // Find the first block with a timestamp at or after the threshold (finalizedBlock always satisfies it)
      const thresholdTimestamp = blockMode === 'earliest' ? targetTimestamp : targetTimestamp + 1n

      let low = 0n
      let high = finalizedBlock.number
      while (low < high) {
        const mid = (low + high) / 2n
        const block = await this.rpc.getBlock({ blockNumber: mid })

        if (block.timestamp >= thresholdTimestamp) {
          high = mid
        } else {
          low = mid + 1n
        }

        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (blockMode === 'earliest') return low

      if (low === 0n) {
        spinner?.fail()
        error(`Block does not exist for target timestamp: ${targetTimestamp.toString()}, exiting.`)
        process.exit(1)
      }

      // The block before the first block after the target timestamp is the last block at or before it
      return low - 1n
    } catch (err) {
      if (err instanceof Error) {
        const text = `Failed to get block for timestamp: ${targetTimestamp}: ${err.message}, exiting.`
        spinner ? spinner.fail(text) : error(text)
      } else {
        const text = `Failed to get block for timestamp: ${targetTimestamp}, exiting.`
        spinner ? spinner.fail(text) : error(text)
      }

      process.exit(1)
    }
  }

  async getRevenue(startTimestamp: number, endTimestamp: number): Promise<Revenue> {
    try {
      const { data } = await axios.get<Revenue>('https://api.revenue.shapeshift.com/api/v1/affiliate/revenue', {
        params: {
          startDate: new Date(startTimestamp).toISOString().split('T')[0],
          endDate: new Date(endTimestamp).toISOString().split('T')[0],
        },
      })
      return data
    } catch (err) {
      if (isAxiosError(err)) {
        error(
          `Failed to get revenue for period (start: ${startTimestamp} - end: ${endTimestamp}): ${err.message}, exiting.`,
        )
      } else {
        error(`Failed to get revenue for period (start: ${startTimestamp} - end: ${endTimestamp}), exiting.`)
      }

      process.exit(1)
    }
  }

  async getPrice(): Promise<Price> {
    const url = 'https://api.proxy.shapeshift.com/api/v1/markets/simple/price'

    try {
      const {
        data: { 'usd-coin': usdc },
      } = await axios.get<{ 'usd-coin': { usd: number } }>(url, { params: { vs_currencies: 'usd', ids: 'usd-coin' } })

      const {
        data: { 'shapeshift-fox-token': fox },
      } = await axios.get<{ 'shapeshift-fox-token': { usd: number } }>(url, {
        params: { vs_currencies: 'usd', ids: 'shapeshift-fox-token' },
      })

      info(`Current USDC price (USD): ${usdc.usd}`)
      info(`Current FOX price (USD): ${fox.usd}`)

      return {
        assetPriceUsd: {
          [ETHEREUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]: String(fox.usd),
        },
        rewardAssetPriceUsd: String(usdc.usd),
      }
    } catch (err) {
      if (isAxiosError(err)) {
        error(`Failed to get price: ${err.message}, exiting.`)
      } else {
        error('Failed to get price, exiting.')
      }

      process.exit(1)
    }
  }

  private async getClosingStateByStakingAddress(
    stakingContract: Address,
    addresses: Address[],
    startBlock: bigint,
    endBlock: bigint,
  ): Promise<Record<string, ClosingState>> {
    const contract = getContract({
      address: stakingContract,
      abi: stakingV1Abi,
      client: { public: this.rpc },
    })

    const prevEpochEndBlock = startBlock - 1n

    const closingStateByStakingAddress: Record<string, ClosingState> = {}
    for await (const address of addresses) {
      const totalRewardUnitsPrevEpoch = await contract.read.earned([address], {
        blockNumber: prevEpochEndBlock,
      })
      const totalRewardUnits = await contract.read.earned([address], { blockNumber: endBlock })

      const rewardUnits = totalRewardUnits - totalRewardUnitsPrevEpoch

      // sleep momentarily to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (rewardUnits <= 0) continue

      closingStateByStakingAddress[address] = { rewardUnits, totalRewardUnits, rewardAddress: address }
    }

    return closingStateByStakingAddress
  }

  private async getDistributionsByStakingAddress(
    closingStateByStakingAddress: ClosingStateByStakingAddress,
    totalDistribution: BigNumber,
  ) {
    const totalEpochRewardUnits = Object.values(closingStateByStakingAddress).reduce(
      (prev, { rewardUnits }) => prev + rewardUnits,
      0n,
    )

    const distributionsByStakingAddress: Record<string, RewardDistribution> = {}
    for await (const [address, { rewardUnits, totalRewardUnits, rewardAddress }] of Object.entries(
      closingStateByStakingAddress,
    )) {
      const percentageShare = BigNumber(rewardUnits.toString()).div(totalEpochRewardUnits.toString())
      const amount = percentageShare.times(totalDistribution.toString()).toFixed(0)

      distributionsByStakingAddress[address] = {
        amount,
        rewardUnits: rewardUnits.toString(),
        totalRewardUnits: totalRewardUnits.toString(),
        rewardAddress,
        txId: '',
      }
    }

    return distributionsByStakingAddress
  }

  async calculateRewards({
    stakingContract,
    startBlock,
    endBlock,
    secondsInEpoch,
    distributionRate,
    totalRevenue,
  }: CalculateRewardsArgs): Promise<{
    totalRewardUnits: string
    distributionsByStakingAddress: Record<string, RewardDistribution>
  }> {
    const spinner = ora(`Calculating reward distribution for staking contract: ${stakingContract}`).start()

    try {
      const stakeEvents = await this.rpc.getContractEvents({
        address: stakingContract,
        abi: stakingV1Abi,
        eventName: 'Stake',
        fromBlock: ETHEREUM_RFOX_PROXY_CONTRACT_DEPLOYMENT_BLOCK,
        toBlock: endBlock,
      })

      const addresses = [
        ...new Set(stakeEvents.map(event => event.args.account).filter(address => Boolean(address))),
      ] as Address[]

      const totalDistribution = BigNumber(totalRevenue).times(distributionRate)

      const closingStateByStakingAddress = await this.getClosingStateByStakingAddress(
        stakingContract,
        addresses,
        startBlock,
        endBlock,
      )

      const distributionsByStakingAddress = await this.getDistributionsByStakingAddress(
        closingStateByStakingAddress,
        totalDistribution,
      )

      const totalEpochRewardUnits = Object.values(closingStateByStakingAddress).reduce(
        (prev, { rewardUnits }) => prev + rewardUnits,
        0n,
      )

      const totalEpochDistribution = Object.values(distributionsByStakingAddress).reduce(
        (prev, { amount }) => prev.plus(BigNumber(amount)),
        BigNumber(0),
      )

      spinner.succeed()

      info(`Total addresses receiving rewards: ${Object.keys(distributionsByStakingAddress).length}`)

      const epochRewardUnits = RFOX_REWARD_RATE * secondsInEpoch
      const epochRewardUnitsMargin = BigNumber(epochRewardUnits.toString()).times(0.0001)

      if (epochRewardUnitsMargin.lte(Math.abs(Number(epochRewardUnits - totalEpochRewardUnits)))) {
        warn(
          'The total reward units calculated for all stakers is outside of the expected .01% margin of the total epoch reward units.',
        )

        info(`Total Reward Units Calculated: ${totalEpochRewardUnits}`)
        info(`Total Epoch Reward Units: ${epochRewardUnits}`)

        const confirmed = await prompts.confirm({ message: 'Do you want to continue? ' })

        if (!confirmed) process.exit(0)
      }

      const totalDistributionMargin = totalDistribution.times(0.0001)

      if (totalDistributionMargin.lte(Math.abs(totalDistribution.minus(totalEpochDistribution).toNumber()))) {
        warn(
          'The total reward distribution calculated for all stakers is outside of the expected .01% margin of the total rewards to be distributed.',
        )

        info(`Total Distribution Calculated: ${totalEpochDistribution.div(1000000).toFixed()} USDC`)
        info(`Total Epoch Distribution: ${totalDistribution.div(1000000).toFixed()} USDC`)

        const confirmed = await prompts.confirm({ message: 'Do you want to continue? ' })

        if (!confirmed) process.exit(0)
      }

      return {
        totalRewardUnits: totalEpochRewardUnits.toString(),
        distributionsByStakingAddress,
      }
    } catch (err) {
      if (err instanceof Error) {
        spinner.fail(`${err.message}, exiting.`)
      } else {
        spinner.fail('An unknown error occured while calculating reward distribution, exiting.')
      }

      process.exit(1)
    }
  }
}
