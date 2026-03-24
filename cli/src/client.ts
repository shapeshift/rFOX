import * as prompts from '@inquirer/prompts'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import ora, { Ora } from 'ora'
import { Address, PublicClient, createPublicClient, getContract, http, parseAbi } from 'viem'
import { arbitrum } from 'viem/chains'
import { stakingV1Abi } from '../generated/abi'
import { RFOX_REWARD_RATE } from './constants'
import { error, info, warn } from './logging'
import { CalculateRewardsArgs, RewardDistribution } from './types'

const INFURA_API_KEY = process.env['INFURA_API_KEY']
if (!INFURA_API_KEY) {
  error('INFURA_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

const AVERAGE_BLOCK_TIME_BLOCKS = 1000

export const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX: Address = '0xaC2a4fD70BCD8Bab0662960455c363735f0e2b56'

export const stakingContracts = [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]

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
      chain: arbitrum,
      transport: http(`https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`),
    })
  }

  static async new(): Promise<Client> {
    return new Client()
  }

  async getBlockByTimestamp(targetTimestamp: bigint, blockMode: 'earliest' | 'latest', spinner?: Ora): Promise<bigint> {
    try {
      const latestBlock = await this.rpc.getBlock()

      if (targetTimestamp > latestBlock.timestamp) {
        spinner?.fail()
        error(`Block does not exit for target timestamp: ${targetTimestamp.toString()}, exiting.`)
        process.exit(1)
      }

      const historicalBlock = await this.rpc.getBlock({
        blockNumber: latestBlock.number - BigInt(AVERAGE_BLOCK_TIME_BLOCKS),
      })

      const averageBlockTimeSeconds =
        Number(latestBlock.timestamp - historicalBlock.timestamp) / AVERAGE_BLOCK_TIME_BLOCKS

      const timeDifferenceSeconds = latestBlock.timestamp - targetTimestamp
      const targetBlocksToMove = BigInt(Math.floor(Number(timeDifferenceSeconds) / averageBlockTimeSeconds))

      let blockNumber = latestBlock.number - targetBlocksToMove
      while (true) {
        if (blockNumber <= 0n) return 0n
        const block = await this.rpc.getBlock({ blockNumber })
        const timeDifferenceSeconds = targetTimestamp - block.timestamp

        // Block is within 1 block before the target timestamp
        // Math.ceil is used for averageBlockTimeSeconds because if its sub second, we will never converge
        // on a solution.
        if (timeDifferenceSeconds >= 0n && timeDifferenceSeconds <= Math.ceil(averageBlockTimeSeconds)) break
        const blocksToMove = BigInt(Math.ceil(Math.abs(Number(timeDifferenceSeconds)) / averageBlockTimeSeconds))

        if (block.timestamp > targetTimestamp) {
          blockNumber -= blocksToMove
        } else {
          blockNumber += blocksToMove
        }
        // sleep momentarily to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // In case of multiple batched blocks for a target timestamp, find the earliest or latest block based on blockMode
      while (true) {
        if (blockNumber <= 0n) return 0n
        if (blockNumber >= latestBlock.number) return latestBlock.number

        const nextBlockNumber = blockMode === 'earliest' ? blockNumber - 1n : blockNumber + 1n

        const block = await this.rpc.getBlock({ blockNumber: nextBlockNumber })

        if (block.timestamp !== targetTimestamp) break

        blockNumber = nextBlockNumber
        // sleep momentarily to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return blockNumber
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
          [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]: String(fox.usd),
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
        fromBlock: 'earliest',
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
