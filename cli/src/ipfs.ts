import * as prompts from '@inquirer/prompts'
import { PinataSDK } from 'pinata'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import { error, info } from './logging'
import { Epoch, EpochDetails, RFOXMetadata, RewardDistribution } from './types'
import { MONTHS } from './constants'
import { ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX } from './client'

const PINATA_JWT = process.env['PINATA_JWT']
const PINATA_GATEWAY_URL = process.env['PINATA_GATEWAY_URL']
const PINATA_GATEWAY_API_KEY = process.env['PINATA_GATEWAY_API_KEY']
const UNCHAINED_URL = process.env['UNCHAINED_URL']
const UNCHAINED_V1_URL = process.env['UNCHAINED_V1_URL']

if (!PINATA_JWT) {
  error('PINATA_JWT not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!PINATA_GATEWAY_URL) {
  error('PINATA_GATEWAY_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!PINATA_GATEWAY_API_KEY) {
  error('PINATA_GATEWAY_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!UNCHAINED_URL) {
  error('UNCHAINED_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!UNCHAINED_V1_URL) {
  error('UNCHAINED_V1_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

type Tx = {
  timestamp: number
}

const isMetadata = (obj: any): obj is RFOXMetadata => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.epoch === 'number' &&
    typeof obj.epochStartTimestamp === 'number' &&
    typeof obj.epochEndTimestamp === 'number' &&
    typeof obj.treasuryAddress === 'string' &&
    Boolean(obj.treasuryAddress) &&
    typeof obj.burnRate === 'number' &&
    obj.distributionRateByStakingContract !== null &&
    typeof obj.distributionRateByStakingContract === 'object' &&
    Object.values(obj.distributionRateByStakingContract).every(value => typeof value === 'number') &&
    obj.ipfsHashByEpoch !== null &&
    typeof obj.ipfsHashByEpoch === 'object' &&
    Object.values(obj.ipfsHashByEpoch).every(value => typeof value === 'string' && Boolean(value))
  )
}

const isEpoch = (obj: any): obj is Epoch => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.number === 'number' &&
    typeof obj.startTimestamp === 'number' &&
    typeof obj.endTimestamp === 'number' &&
    typeof obj.distributionTimestamp === 'number' &&
    typeof obj.startBlock === 'number' &&
    typeof obj.endBlock === 'number' &&
    typeof obj.treasuryAddress === 'string' &&
    Boolean(obj.treasuryAddress) &&
    typeof obj.totalRevenue === 'string' &&
    Boolean(obj.totalRevenue) &&
    typeof obj.burnRate === 'number' &&
    (obj.distributionStatus === 'pending' || obj.distributionStatus === 'complete') &&
    obj.detailsByStakingContract !== null &&
    typeof obj.detailsByStakingContract === 'object' &&
    Object.values(obj.detailsByStakingContract).every(isEpochDetails)
  )
}

export function isEpochDetails(obj: any): obj is EpochDetails {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.totalRewardUnits === 'string' &&
    typeof obj.distributionRate === 'number' &&
    obj.distributionsByStakingAddress !== null &&
    typeof obj.distributionsByStakingAddress === 'object' &&
    Object.values(obj.distributionsByStakingAddress).every(isRewardDistribution)
  )
}

const isRewardDistribution = (obj: any): obj is RewardDistribution => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.amount === 'string' &&
    typeof obj.rewardUnits === 'string' &&
    typeof obj.txId === 'string' &&
    typeof obj.rewardAddress === 'string'
  )
}

export class IPFS {
  private client: PinataSDK

  constructor(client: PinataSDK) {
    this.client = client
  }

  static async new(): Promise<IPFS> {
    try {
      const client = new PinataSDK({
        pinataJwt: PINATA_JWT,
        pinataGateway: PINATA_GATEWAY_URL,
        pinataGatewayKey: PINATA_GATEWAY_API_KEY,
      })

      await client.testAuthentication()

      return new IPFS(client)
    } catch {
      error('Failed to connect to IPFS, exiting.')
      process.exit(1)
    }
  }

  async addEpoch(epoch: Epoch): Promise<string> {
    try {
      const { cid } = await this.client.upload.public
        .json(epoch)
        .name(`rFoxEpoch${epoch.number}_${epoch.distributionStatus}.json`)

      info(`rFOX Epoch #${epoch.number} IPFS hash: ${cid}`)

      return cid
    } catch {
      error('Failed to add epoch to IPFS, exiting.')
      process.exit(1)
    }
  }

  async getEpoch(hash?: string): Promise<Epoch> {
    if (!hash) {
      hash = await prompts.input({
        message: 'What is the IPFS hash for the rFOX epoch you want to process? ',
      })
    }

    try {
      const { data } = await this.client.gateways.public.get(hash)

      if (isEpoch(data)) {
        const month = MONTHS[new Date(data.startTimestamp).getUTCMonth()]

        const distributions = Object.values(data.detailsByStakingContract)
          .flatMap(details => Object.values(details.distributionsByStakingAddress))
          .filter(distribution => BigNumber(distribution.amount).gt(0))

        const totalDistributionAmount = distributions.reduce((prev, distribution) => {
          return prev.plus(distribution.amount)
        }, BigNumber(0))

        const totalRewards = totalDistributionAmount.div(100000000).toFixed()
        const totalAddresses = distributions.length

        info(
          `${month} rFOX reward distribution for Epoch #${data.number}:\n    - Total Rewards: ${totalRewards} RUNE\n    - Total Addresses: ${totalAddresses}`,
        )

        return data
      } else {
        error(`The contents of IPFS hash (${hash}) are not valid epoch contents, exiting.`)
        process.exit(1)
      }
    } catch (err) {
      if (isAxiosError(err)) {
        error(
          `Failed to get content of IPFS hash (${hash}): ${err.request?.data?.message || err.response?.data?.message || err.message}, exiting.`,
        )
      } else {
        error(`Failed to get content of IPFS hash (${hash}): ${err}, exiting.`)
      }

      process.exit(1)
    }
  }

  async updateMetadata(
    metadata: RFOXMetadata,
    overrides?: {
      epoch?: { number: number; hash: string }
      metadata?: Partial<Pick<RFOXMetadata, 'epoch' | 'epochStartTimestamp' | 'epochEndTimestamp'>>
    },
  ): Promise<string | undefined> {
    if (overrides) {
      if (overrides.metadata?.epoch !== undefined) metadata.epoch = overrides.metadata.epoch
      if (overrides.metadata?.epochStartTimestamp !== undefined)
        metadata.epochStartTimestamp = overrides.metadata.epochStartTimestamp
      if (overrides.metadata?.epochEndTimestamp !== undefined)
        metadata.epochEndTimestamp = overrides.metadata.epochEndTimestamp

      if (overrides.epoch) {
        metadata.ipfsHashByEpoch[overrides.epoch.number] = overrides.epoch.hash

        const { cid } = await this.client.upload.public.json(metadata).name('rFoxMetadata.json')

        info(`rFOX Metadata IPFS hash: ${cid}`)

        return cid
      }
    }

    const choice = await prompts.select<'distributionRate' | 'burnRate' | 'treasuryAddress' | 'skip'>({
      message: 'What do you want to update?',
      choices: [
        {
          name: 'Distribution Rate',
          value: 'distributionRate',
          description:
            'Update the current percentage of revenue (RUNE) earned by the treasury to be distributed as rewards.',
        },
        {
          name: 'Burn Rate',
          value: 'burnRate',
          description:
            'Update the current percentage of revenue (RUNE) earned by the treasury to be used to buy FOX and then burn it.',
        },
        {
          name: 'Treasury Address',
          value: 'treasuryAddress',
          description: 'Update the THORChain treasury address used to determine revenue earned by the DAO.',
        },
        { name: 'Skip', value: 'skip' },
      ],
    })

    switch (choice) {
      case 'distributionRate': {
        const choice = await prompts.select({
          message: 'What staking contract do you want to update',
          choices: Object.keys(metadata.distributionRateByStakingContract).map(stakingContract => ({
            name: stakingContract,
            value: stakingContract,
          })),
        })

        const distributionRate = parseFloat(
          await prompts.input({
            message: `The distribution rate is currently set to ${metadata.distributionRateByStakingContract[choice]}, what do you want to update it to? `,
          }),
        )

        if (isNaN(distributionRate) || distributionRate < 0 || distributionRate > 1) {
          error(`Invalid distribution rate, it must be a number between 0 and 1 (ex. 0.25).`)
          return this.updateMetadata(metadata)
        }

        metadata.distributionRateByStakingContract[choice] = distributionRate

        break
      }
      case 'burnRate': {
        const burnRate = parseFloat(
          await prompts.input({
            message: `The burn rate is currently set to ${metadata.burnRate}, what do you want to update it to? `,
          }),
        )

        if (isNaN(burnRate) || burnRate < 0 || burnRate > 1) {
          error(`Invalid burn rate, it must be a number between 0 and 1 (ex. 0.25).`)
          return this.updateMetadata(metadata)
        }

        metadata.burnRate = burnRate

        break
      }
      case 'treasuryAddress': {
        const treasuryAddress = await prompts.input({
          message: `The treasury address is currently set to ${metadata.treasuryAddress}, what do you want to update it to? `,
        })

        if (!/^thor[a-z0-9]{39}$/.test(treasuryAddress)) {
          error(`Invalid treasury address, please check your address and try again.`)
          return this.updateMetadata(metadata)
        }

        metadata.treasuryAddress = treasuryAddress

        break
      }
      case 'skip':
        break
      default:
        error(`Invalid choice: ${choice}, exiting.`)
        process.exit(1)
    }

    const confirmed = await prompts.confirm({
      message: `Do you want to update another value?`,
    })

    if (confirmed) {
      return this.updateMetadata(metadata)
    } else {
      const totalDistributionRate = Object.values(metadata.distributionRateByStakingContract).reduce(
        (prev, distributionRate) => {
          return prev + distributionRate
        },
        0,
      )

      if (totalDistributionRate + metadata.burnRate > 1) {
        error(
          `Invalid rates, the sum of the distribution rate and burn rate must be a number between 0 and 1 (ex. 0.5).`,
        )
        return this.updateMetadata(metadata)
      }

      info(
        `The new metadata values will be:\n    - Distribtution Rates: ${JSON.stringify(metadata.distributionRateByStakingContract)}\n    - Burn Rate: ${metadata.burnRate}\n    - Treasury Address: ${metadata.treasuryAddress}`,
      )

      const confirmed = await prompts.confirm({
        message: `Do you want to update the metadata with the new values?`,
      })

      if (!confirmed) return

      const { cid } = await this.client.upload.public.json(metadata).name('rFoxMetadata.json')

      info(`rFOX Metadata IPFS hash: ${cid}`)

      return cid
    }
  }

  async getMetadata(promptAction: string): Promise<RFOXMetadata> {
    const hash = await prompts.input({
      message: `What is the IPFS hash for the rFOX metadata you want to ${promptAction}? `,
    })

    try {
      const { data } = await this.client.gateways.public.get(hash)

      if (isMetadata(data)) return data

      error(`The contents of IPFS hash (${hash}) are not valid metadata contents, exiting.`)
      process.exit(1)
    } catch (err) {
      if (isAxiosError(err)) {
        error(
          `Failed to get content of IPFS hash (${hash}): ${err.request?.data || err.response?.data || err.message}, exiting.`,
        )
      } else {
        error(`Failed to get content of IPFS hash (${hash}): ${err}, exiting.`)
      }

      process.exit(1)
    }
  }

  async getEpochFromMetadata(metadata: RFOXMetadata): Promise<Epoch> {
    const hash = metadata.ipfsHashByEpoch[metadata.epoch - 1]

    if (!hash) {
      error(`No IPFS hash found for epoch ${metadata.epoch - 1}, exiting.`)
      process.exit(1)
    }

    const epoch = await this.getEpoch(hash)
    const month = MONTHS[new Date(epoch.startTimestamp).getUTCMonth()]

    switch (epoch.distributionStatus) {
      case 'pending':
        info(`Running ${month} rFOX reward distribution for Epoch #${epoch.number}.`)
        break
      case 'complete':
        info(`The ${month} rFOX reward distribution for Epoch #${epoch.number} is already complete, exiting.`)
        process.exit(0)
    }

    return epoch
  }

  private async migrate_v1(data: any) {
    const metadata = {
      epoch: data.epoch,
      epochStartTimestamp: data.epochStartTimestamp,
      epochEndTimestamp: data.epochEndTimestamp,
      treasuryAddress: data.treasuryAddress,
      burnRate: data.burnRate,
      distributionRateByStakingContract: {
        [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]: data.distributionRate,
      },
      ipfsHashByEpoch: {} as Record<string, string>,
    }

    for (const [epochNum, epochHash] of Object.entries<string>(data.ipfsHashByEpoch)) {
      const { data } = (await this.client.gateways.public.get(epochHash)) as any

      if (isEpoch(data)) {
        metadata.ipfsHashByEpoch[epochNum] = epochHash
        continue
      }

      const epoch = {
        number: data.number,
        startTimestamp: data.startTimestamp,
        endTimestamp: data.endTimestamp,
        startBlock: data.startBlock,
        endBlock: data.endBlock,
        treasuryAddress: data.treasuryAddress,
        totalRevenue: data.totalRevenue,
        burnRate: data.burnRate,
        ...(data.runePriceUsd && {
          runePriceUsd: data.runePriceUsd,
        }),
        distributionStatus: data.distributionStatus,
        detailsByStakingContract: {
          [ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX]: {
            totalRewardUnits: data.totalRewardUnits,
            distributionRate: data.distributionRate,
            ...(data.assetPriceUsd && {
              assetPriceUsd: data.assetPriceUsd,
            }),
            distributionsByStakingAddress: data.distributionsByStakingAddress,
          },
        },
      }

      metadata.ipfsHashByEpoch[epochNum] = await this.addEpoch(epoch)
    }

    return metadata
  }

  async migrate_v2(data: RFOXMetadata): Promise<RFOXMetadata> {
    const metadata: RFOXMetadata = { ...data, ipfsHashByEpoch: {} }

    for (const [epochNum, epochHash] of Object.entries(data.ipfsHashByEpoch)) {
      const { data } = (await this.client.gateways.public.get(epochHash)) as any

      if (isEpoch(data)) {
        metadata.ipfsHashByEpoch[epochNum] = epochHash
        continue
      }

      const distributions = Object.values<{ txId: string }>(
        data.detailsByStakingContract[ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX].distributionsByStakingAddress,
      )

      const txid = distributions[0].txId

      if (!txid) {
        metadata.ipfsHashByEpoch[epochNum] = epochHash
        continue
      }

      const { data: tx } = await (async () => {
        try {
          return await axios.get<Tx>(`${UNCHAINED_URL}/api/v1/tx/${txid}`)
        } catch {
          return await axios.get<Tx>(`${UNCHAINED_V1_URL}/api/v1/tx/${txid}`)
        }
      })()

      const epoch: Epoch = {
        number: data.number,
        startTimestamp: data.startTimestamp,
        endTimestamp: data.endTimestamp,
        distributionTimestamp: tx.timestamp * 1000,
        startBlock: data.startBlock,
        endBlock: data.endBlock,
        treasuryAddress: data.treasuryAddress,
        totalRevenue: data.totalRevenue,
        ...(data.revenue && { revenue: data.revenue }),
        burnRate: data.burnRate,
        ...(data.runePriceUsd && { runePriceUsd: data.runePriceUsd }),
        distributionStatus: data.distributionStatus,
        detailsByStakingContract: data.detailsByStakingContract,
      }

      metadata.ipfsHashByEpoch[epochNum] = await this.addEpoch(epoch)
    }

    return metadata
  }

  async migrate(): Promise<RFOXMetadata> {
    const metadataHash = await prompts.input({
      message: `What is the IPFS hash for the rFOX metadata you want to migrate? `,
    })

    try {
      const { data: metadata } = (await this.client.gateways.public.get(metadataHash)) as any

      if (!isMetadata(metadata)) {
        console.log('invalid metadata', metadata)
        if (!('distributionRateByStakingContract' in metadata)) return this.migrate_v1(metadata)
      }

      for (const [_, epochHash] of Object.entries<string>(metadata.ipfsHashByEpoch).sort(
        ([a], [b]) => Number(b) - Number(a),
      )) {
        const { data: epoch } = (await this.client.gateways.public.get(epochHash)) as any

        if (!isEpoch(epoch)) {
          if (!('distributionTimestamp' in metadata)) return this.migrate_v2(metadata)
        }
      }

      return metadata
    } catch (err) {
      if (isAxiosError(err)) {
        error(
          `Failed to migrate IPFS hash (${metadataHash}): ${err.request?.data || err.response?.data || err.message}, exiting.`,
        )
      } else {
        error(`Failed to migrate IPFS hash (${metadataHash}): ${err}, exiting.`)
      }

      process.exit(1)
    }
  }
}
