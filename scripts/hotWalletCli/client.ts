import * as prompts from '@inquirer/prompts'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import ora, { Ora } from 'ora'
import { Address, PublicClient, createPublicClient, getAddress, getContract, http } from 'viem'
import { arbitrum } from 'viem/chains'
import { RFOX_REWARD_RATE, RFOX_WAD } from './constants'
import { stakingV1Abi } from './generated/abi'
import { error, info, warn } from './logging'
import { RewardDistribution } from './types'

const INFURA_API_KEY = process.env['INFURA_API_KEY']

if (!INFURA_API_KEY) {
  error('INFURA_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

const AVERAGE_BLOCK_TIME_BLOCKS = 1000
const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS = '0xac2a4fd70bcd8bab0662960455c363735f0e2b56'

type Revenue = {
  address: string
  amount: string
}

type ClosingState = {
  rewardUnits: bigint
  totalRewardUnits: bigint
  runeAddress: string
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
        if (timeDifferenceSeconds >= 0n && timeDifferenceSeconds <= averageBlockTimeSeconds) break

        const blocksToMove = BigInt(Math.ceil(Math.abs(Number(timeDifferenceSeconds)) / averageBlockTimeSeconds))

        if (block.timestamp > targetTimestamp) {
          blockNumber -= blocksToMove
        } else {
          blockNumber += blocksToMove
        }
      }

      // In case of multiple batched blocks for a target timestamp, find the earliest or latest block based on blockMode
      while (true) {
        if (blockNumber <= 0n) return 0n
        if (blockNumber >= latestBlock.number) return latestBlock.number

        const nextBlockNumber = blockMode === 'earliest' ? blockNumber - 1n : blockNumber + 1n

        const block = await this.rpc.getBlock({ blockNumber: nextBlockNumber })

        if (block.timestamp !== targetTimestamp) break

        blockNumber = nextBlockNumber
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
      const { data } = await axios.get<Revenue>(
        `https://api.thorchain.shapeshift.com/api/v1/affiliate/revenue?start=${startTimestamp}&end=${endTimestamp}`,
      )
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

  private async getClosingStateByStakingAddress(
    addresses: Address[],
    startBlock: bigint,
    endBlock: bigint,
  ): Promise<Record<string, ClosingState>> {
    const contract = getContract({
      address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
      abi: stakingV1Abi,
      client: { public: this.rpc },
    })

    const prevEpochEndBlock = startBlock - 1n

    const closingStateByStakingAddress: Record<string, ClosingState> = {}
    for await (const address of addresses) {
      const [stakingBalance, _unstakingBalance, _earnedRewards, _rewardPerTokenStored, runeAddress] =
        await contract.read.stakingInfo([getAddress(address)], { blockNumber: endBlock })

      if (stakingBalance <= 0n) continue

      const totalRewardUnitsPrevEpoch = await contract.read.earned([address], {
        blockNumber: prevEpochEndBlock,
      })
      const totalRewardUnits = await contract.read.earned([address], { blockNumber: endBlock })

      const rewardUnits = (totalRewardUnits - totalRewardUnitsPrevEpoch) / RFOX_WAD

      closingStateByStakingAddress[address] = { rewardUnits, totalRewardUnits, runeAddress }
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
    for await (const [address, { rewardUnits, totalRewardUnits, runeAddress }] of Object.entries(
      closingStateByStakingAddress,
    )) {
      const percentageShare = BigNumber(rewardUnits.toString()).div(totalEpochRewardUnits.toString())
      const amount = percentageShare.times(totalDistribution.toString()).toFixed(0)

      distributionsByStakingAddress[address] = {
        amount,
        rewardUnits: rewardUnits.toString(),
        totalRewardUnits: totalRewardUnits.toString(),
        rewardAddress: runeAddress,
        txId: '',
      }
    }

    return distributionsByStakingAddress
  }

  async calculateRewards(
    startBlock: bigint,
    endBlock: bigint,
    secondsInEpoch: bigint,
    totalDistribution: BigNumber,
  ): Promise<{ totalRewardUnits: string; distributionsByStakingAddress: Record<string, RewardDistribution> }> {
    const spinner = ora('Calculating reward distribution').start()

    try {
      const stakeEvents = await this.rpc.getContractEvents({
        address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
        abi: stakingV1Abi,
        eventName: 'Stake',
        fromBlock: 'earliest',
        toBlock: endBlock,
      })

      const addresses = [
        ...new Set(stakeEvents.map(event => event.args.account).filter(address => Boolean(address))),
      ] as Address[]

      const closingStateByStakingAddress = await this.getClosingStateByStakingAddress(addresses, startBlock, endBlock)
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

      info(`Total addresses receiving rewards: ${addresses.length}`)

      const epochRewardUnits = (RFOX_REWARD_RATE / RFOX_WAD) * secondsInEpoch
      const epochRewardUnitsMargin = BigNumber(epochRewardUnits.toString()).times(0.01)

      if (epochRewardUnitsMargin.lte(Math.abs(Number(epochRewardUnits - totalEpochRewardUnits)))) {
        warn(
          'The total reward units calculated for all stakers is outside of the expected 1% margin of the total epoch reward units.',
        )

        info(`Total Reward Units Calculated: ${totalEpochRewardUnits}`)
        info(`Total Epoch Reward Units: ${epochRewardUnits}`)

        const confirmed = await prompts.confirm({ message: 'Do you want to continue? ' })

        if (!confirmed) process.exit(0)
      }

      const totalDistributionMargin = totalDistribution.times(0.01)

      if (totalDistributionMargin.lte(Math.abs(totalDistribution.minus(totalEpochDistribution).toNumber()))) {
        warn(
          'The total reward distribution calculated for all stakers is outside of the expected 1% margin of the total rewards to be distributed.',
        )

        info(`Total Distribtution Calculated: ${totalEpochDistribution.div(100000000).toFixed()} RUNE`)
        info(`Total Epoch Distribution: ${totalDistribution.div(100000000).toFixed()} RUNE`)

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
