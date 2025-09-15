import * as prompts from '@inquirer/prompts'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import ora, { Ora } from 'ora'
import { Address, PublicClient, createPublicClient, getAddress, getContract, http, parseAbi } from 'viem'
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

const THORNODE_URL = process.env['THORNODE_URL']
if (!THORNODE_URL) {
  error('THORNODE_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

const UNCHAINED_URL = process.env['UNCHAINED_URL']
if (!UNCHAINED_URL) {
  error('UNCHAINED_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

const AVERAGE_BLOCK_TIME_BLOCKS = 1000
const THORCHAIN_PRECISION = 8
const TOKEN_PRECISION = 18
const UNIV2_ETH_FOX_LP_TOKEN: Address = '0x5F6Ce0Ca13B87BD738519545d3E018e70E339c24'

export const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX: Address = '0xaC2a4fD70BCD8Bab0662960455c363735f0e2b56'
export const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_UNIV2_ETH_FOX: Address = '0x83B51B7605d2E277E03A7D6451B1efc0e5253A2F'

export const stakingContracts = [
  ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX,
  ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_UNIV2_ETH_FOX,
]

type Revenue = {
  addresses: string[]
  amount: string
  revenue: Record<string, string>
}

type Pool = {
  balance_asset: string
  balance_rune: string
  asset_tor_price: string
}

type Price = {
  assetPriceUsd: Record<string, string>
  runePriceUsd: string
}

type ClosingState = {
  rewardUnits: bigint
  totalRewardUnits: bigint
  runeAddress: string
}

type ClosingStateByStakingAddress = Record<string, ClosingState>

const toPrecision = (value: string | number | bigint, precision: number) => {
  return new BigNumber(value.toString()).div(new BigNumber(10).pow(precision))
}

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
      const { data } = await axios.get<Revenue>(
        `${UNCHAINED_URL}/api/v1/affiliate/revenue?start=${startTimestamp}&end=${endTimestamp}`,
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

  async getTotalRevenueInRune(revenue: Record<string, string>): Promise<string> {
    try {
      let total = new BigNumber(0)

      for (const [denom, amount] of Object.entries(revenue)) {
        if (denom === 'THOR.RUNE') {
          total = total.plus(amount)
          continue
        }

        const { data: pool } = await axios.get<Pool>(`${THORNODE_URL}/lcd/thorchain/pool/${denom}`)

        const assetInRune = new BigNumber(pool.balance_rune).div(pool.balance_asset)

        total = total.plus(new BigNumber(amount).times(assetInRune).toFixed(0))
      }

      return total.toFixed()
    } catch (err) {
      if (isAxiosError(err)) {
        error(`Failed to get total revenue in rune: ${err.message}, exiting.`)
      } else {
        error('Failed to get total revenue in rune, exiting.')
      }

      process.exit(1)
    }
  }

  async getPrice(): Promise<Price> {
    try {
      const { data: ethPool } = await axios.get<Pool>(`${THORNODE_URL}/lcd/thorchain/pool/ETH.ETH`)

      const { data: foxPool } = await axios.get<Pool>(
        `${THORNODE_URL}/lcd/thorchain/pool/ETH.FOX-0XC770EEFAD204B5180DF6A14EE197D99D808EE52D`,
      )

      const ethPriceUsd = toPrecision(ethPool.asset_tor_price, THORCHAIN_PRECISION).toFixed(THORCHAIN_PRECISION)
      const foxPriceUsd = toPrecision(foxPool.asset_tor_price, THORCHAIN_PRECISION).toFixed(THORCHAIN_PRECISION)
      const runeInAsset = new BigNumber(foxPool.balance_asset).div(foxPool.balance_rune)
      const runePriceUsd = runeInAsset.times(foxPriceUsd).toFixed(THORCHAIN_PRECISION)

      const address = UNIV2_ETH_FOX_LP_TOKEN
      const abi = parseAbi([
        'function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
        'function totalSupply() view returns (uint256 totalSupply)',
      ])

      const reserves = await this.rpc.readContract({ address, abi, functionName: 'getReserves' })
      const totalSupplyBaseUnit = await this.rpc.readContract({ address, abi, functionName: 'totalSupply' })

      // reserve0 is for token0 (WETH): https://arbiscan.io/address/0x5F6Ce0Ca13B87BD738519545d3E018e70E339c24#readContract#F15
      // reserve1 is for token1 (FOX): https://arbiscan.io/address/0x5F6Ce0Ca13B87BD738519545d3E018e70E339c24#readContract#F16
      const [reserve0, reserve1] = reserves.map(reserveBaseUnit => toPrecision(reserveBaseUnit, TOKEN_PRECISION))
      const totalSupply = toPrecision(totalSupplyBaseUnit, TOKEN_PRECISION)
      const uniV2FoxEthPriceUsd = reserve0
        .times(ethPriceUsd)
        .plus(reserve1.times(foxPriceUsd))
        .div(totalSupply)
        .toFixed(THORCHAIN_PRECISION)

      info(`Current RUNE price (USD): ${runePriceUsd}`)
      info(`Current FOX price (USD): ${foxPriceUsd}`)
      info(`Current Uniswapv2 LP ETH/FOX price (USD): ${uniV2FoxEthPriceUsd}`)

      return {
        assetPriceUsd: {
          [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]: foxPriceUsd,
          [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_UNIV2_ETH_FOX]: uniV2FoxEthPriceUsd,
        },
        runePriceUsd,
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
      const [, , , , runeAddress] = await contract.read.stakingInfo([getAddress(address)], { blockNumber: endBlock })

      const totalRewardUnitsPrevEpoch = await contract.read.earned([address], {
        blockNumber: prevEpochEndBlock,
      })
      const totalRewardUnits = await contract.read.earned([address], { blockNumber: endBlock })

      const rewardUnits = totalRewardUnits - totalRewardUnitsPrevEpoch

      // sleep momentarily to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (rewardUnits <= 0) continue

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

      info(`Total addresses receiving rewards: ${addresses.length}`)

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

        info(`Total Distribution Calculated: ${totalEpochDistribution.div(100000000).toFixed()} RUNE`)
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
