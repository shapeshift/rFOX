import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import ora, { Ora } from 'ora'
import { Address, PublicClient, createPublicClient, getAddress, getContract, http } from 'viem'
import { arbitrum } from 'viem/chains'
import { stakingV1Abi } from './abi'
import { error, info } from './logging'
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

export class Client {
  private rpc: PublicClient
  private archiveRpc: PublicClient

  constructor() {
    this.rpc = createPublicClient({
      chain: arbitrum,
      transport: http('https://api.arbitrum.shapeshift.com/api/v1/jsonrpc'),
    })

    this.archiveRpc = createPublicClient({
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

  async calculateRewards(
    startBlock: bigint,
    endBlock: bigint,
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

      const archiveContract = getContract({
        address: ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS,
        abi: stakingV1Abi,
        client: { public: this.archiveRpc },
      })

      const lastEpochEndBlock = startBlock - 1n

      let totalRewardUnits = 0n
      const closingStateByStakingAddress: Record<string, { rewardUnits: bigint; runeAddress: string }> = {}
      for await (const address of addresses) {
        const [stakingBalance, _unstakingBalance, _earnedRewards, _rewardPerTokenStored, runeAddress] =
          await archiveContract.read.stakingInfo([getAddress(address)], { blockNumber: endBlock })

        if (stakingBalance <= 0n) continue

        const rewardUnitsThroughLastEpoch =
          lastEpochEndBlock >= 0 ? await archiveContract.read.earned([address], { blockNumber: lastEpochEndBlock }) : 0n

        const rewardUnitsThroughCurrentEpoch = await archiveContract.read.earned([address], { blockNumber: endBlock })
        const rewardUnits = rewardUnitsThroughCurrentEpoch - rewardUnitsThroughLastEpoch

        totalRewardUnits += rewardUnits

        closingStateByStakingAddress[address] = { rewardUnits, runeAddress }
      }

      const distributionsByStakingAddress: Record<string, RewardDistribution> = {}
      for await (const [address, { rewardUnits, runeAddress }] of Object.entries(closingStateByStakingAddress)) {
        const percentageShare = BigNumber(rewardUnits.toString()).div(totalRewardUnits.toString())
        const amount = percentageShare.times(totalDistribution.toString()).toFixed(0)

        distributionsByStakingAddress[address] = {
          amount,
          rewardUnits: rewardUnits.toString(),
          rewardAddress: runeAddress,
          txId: '',
        }
      }

      spinner.succeed()

      info(`Total addresses receiving rewards: ${addresses.length}`)

      return {
        totalRewardUnits: totalRewardUnits.toString(),
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
