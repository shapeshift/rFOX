import * as prompts from '@inquirer/prompts'
import PinataClient from '@pinata/sdk'
import axios from 'axios'
import BigNumber from 'bignumber.js'
import { error, info } from './logging'
import { Epoch, RFOXMetadata, RewardDistribution } from './types'
import { MONTHS } from './constants'

const PINATA_API_KEY = process.env['PINATA_API_KEY']
const PINATA_SECRET_API_KEY = process.env['PINATA_SECRET_API_KEY']
const PINATA_GATEWAY_URL = process.env['PINATA_GATEWAY_URL']
const PINATA_GATEWAY_API_KEY = process.env['PINATA_GATEWAY_API_KEY']

if (!PINATA_API_KEY) {
  error('PINATA_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!PINATA_SECRET_API_KEY) {
  error('PINATA_SECRET_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
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

const isMetadata = (obj: any): obj is RFOXMetadata =>
  obj &&
  typeof obj === 'object' &&
  typeof obj.epoch === 'number' &&
  typeof obj.epochStartTimestamp === 'number' &&
  typeof obj.epochEndTimestamp === 'number' &&
  typeof obj.distributionRate === 'number' &&
  typeof obj.burnRate === 'number' &&
  typeof obj.treasuryAddress === 'string' &&
  typeof obj.ipfsHashByEpoch === 'object' &&
  Object.values(obj.ipfsHashByEpoch ?? {}).every(value => typeof value === 'string')

const isEpoch = (obj: any): obj is Epoch =>
  obj &&
  typeof obj === 'object' &&
  typeof obj.number === 'number' &&
  typeof obj.startTimestamp === 'number' &&
  typeof obj.endTimestamp === 'number' &&
  typeof obj.startBlock === 'number' &&
  typeof obj.endBlock === 'number' &&
  typeof obj.totalRevenue === 'string' &&
  typeof obj.totalRewardUnits === 'string' &&
  typeof obj.distributionRate === 'number' &&
  typeof obj.burnRate === 'number' &&
  typeof obj.distributionsByStakingAddress === 'object' &&
  Object.values(obj.distributionsByStakingAddress ?? {}).every(isRewardDistribution)

const isRewardDistribution = (obj: any): obj is RewardDistribution =>
  obj &&
  typeof obj === 'object' &&
  typeof obj.amount === 'string' &&
  typeof obj.rewardUnits === 'string' &&
  typeof obj.txId === 'string' &&
  typeof obj.rewardAddress === 'string'

export class IPFS {
  private client: PinataClient

  constructor(client: PinataClient) {
    this.client = client
  }

  static async new(): Promise<IPFS> {
    try {
      const client = new PinataClient({ pinataApiKey: PINATA_API_KEY, pinataSecretApiKey: PINATA_SECRET_API_KEY })
      await client.testAuthentication()
      return new IPFS(client)
    } catch {
      error('Failed to connect to IPFS, exiting.')
      process.exit(1)
    }
  }

  async addEpoch(epoch: Epoch): Promise<string> {
    try {
      const { IpfsHash } = await this.client.pinJSONToIPFS(epoch, {
        pinataMetadata: { name: `rFoxEpoch${epoch.number}_${epoch.distributionStatus}.json` },
      })

      info(`rFOX Epoch #${epoch.number} IPFS hash: ${IpfsHash}`)

      return IpfsHash
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
      const { data } = await axios.get(`${PINATA_GATEWAY_URL}/ipfs/${hash}`, {
        headers: {
          'x-pinata-gateway-token': PINATA_GATEWAY_API_KEY,
        },
      })

      if (isEpoch(data)) {
        const month = MONTHS[new Date(data.startTimestamp).getUTCMonth()]
        const totalAddresses = Object.keys(data.distributionsByStakingAddress).length
        const totalRewards = Object.values(data.distributionsByStakingAddress)
          .reduce((prev, distribution) => {
            return prev.plus(distribution.amount)
          }, BigNumber(0))
          .div(100000000)
          .toFixed()

        info(
          `Running ${month} rFOX reward distribution for Epoch #${data.number}:\n    - Total Rewards: ${totalRewards} RUNE\n    - Total Addresses: ${totalAddresses}`,
        )

        return data
      } else {
        error(`The contents of IPFS hash (${hash}) are not valid epoch contents, exiting.`)
        process.exit(1)
      }
    } catch {
      error(`Failed to get content of IPFS hash (${hash}), exiting.`)
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

        const { IpfsHash } = await this.client.pinJSONToIPFS(metadata, {
          pinataMetadata: { name: 'rFoxMetadata.json' },
        })

        info(`rFOX Metadata IPFS hash: ${IpfsHash}`)

        return IpfsHash
      }
    }

    const choice = await prompts.select<'distributionRate' | 'burnRate' | 'treasuryAddress'>({
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
      ],
    })

    switch (choice) {
      case 'distributionRate': {
        const distributionRate = parseFloat(
          await prompts.input({
            message: `The distribution rate is currently set to ${metadata.distributionRate}, what do you want to update it to? `,
          }),
        )

        if (isNaN(distributionRate) || distributionRate < 0 || distributionRate > 1) {
          error(`Invalid distribution rate, it must be a number between 0 and 1 (ex. 0.25).`)
          return this.updateMetadata(metadata)
        }

        metadata.distributionRate = distributionRate

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
      if (metadata.distributionRate + metadata.burnRate > 1) {
        error(
          `Invalid rates, the sum of the distribution rate and burn rate must be a number between 0 and 1 (ex. 0.5).`,
        )
        return this.updateMetadata(metadata)
      }

      info(
        `The new metadata values will be:\n    - Distribtution Rate: ${metadata.distributionRate}\n    - Burn Rate: ${metadata.burnRate}\n    - Treasury Address: ${metadata.treasuryAddress}`,
      )

      const confirmed = await prompts.confirm({
        message: `Do you want to update the metadata with the new values?`,
      })

      if (!confirmed) return

      const { IpfsHash } = await this.client.pinJSONToIPFS(metadata, {
        pinataMetadata: { name: 'rFoxMetadata.json' },
      })

      info(`rFOX Metadata IPFS hash: ${IpfsHash}`)

      return IpfsHash
    }
  }

  async getMetadata(promptAction: string): Promise<RFOXMetadata> {
    const hash = await prompts.input({
      message: `What is the IPFS hash for the rFOX metadata you want to ${promptAction}? `,
    })

    try {
      const { data } = await axios.get(`${PINATA_GATEWAY_URL}/ipfs/${hash}`, {
        headers: {
          'x-pinata-gateway-token': PINATA_GATEWAY_API_KEY,
        },
      })

      if (isMetadata(data)) return data

      error(`The contents of IPFS hash (${hash}) are not valid metadata contents, exiting.`)
      process.exit(1)
    } catch {
      error(`Failed to get content of IPFS hash (${hash}), exiting.`)
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
}
