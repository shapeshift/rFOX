import * as prompts from '@inquirer/prompts'
import PinataClient from '@pinata/sdk'
import axios from 'axios'
import { Epoch, RFOXMetadata, RewardDistribution } from '../types'
import { error, info, success, warn } from './logging'

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
    } catch (err) {
      error('Failed to connect to IPFS, exiting.')
      process.exit(1)
    }
  }

  async addEpoch(epoch: Epoch): Promise<string> {
    const { IpfsHash } = await this.client.pinJSONToIPFS(epoch, {
      pinataMetadata: { name: `rFoxEpoch${epoch.number}.json` },
    })

    success(`Epoch added (IPFS hash: ${IpfsHash})`)

    return IpfsHash
  }

  async getEpoch(): Promise<Epoch> {
    const hash = await prompts.input({
      message: 'What is the IPFS hash for the rFOX distribution epoch you wish to process? ',
    })

    try {
      const { data } = await axios.get(`${PINATA_GATEWAY_URL}/ipfs/${hash}`, {
        headers: {
          'x-pinata-gateway-token': PINATA_GATEWAY_API_KEY,
        },
      })

      if (isEpoch(data)) {
        info(`Processing rFOX distribution for Epoch #${data.number}.`)
        return data
      } else {
        error(`The contents of IPFS hash (${hash}) are not valid, exiting.`)
        process.exit(1)
      }
    } catch {
      error(`Failed to get content of IPFS hash (${hash}), exiting.`)
      process.exit(1)
    }
  }

  async updateMetadata(epoch?: { number: number; hash: string }): Promise<string | undefined> {
    const metadata = await this.getMetadata()

    if (epoch) {
      const hash = metadata.ipfsHashByEpoch[epoch.number]

      if (hash) {
        info(`The metadata already contains an IPFS hash for this epoch: ${hash}`)

        const confirmed = await prompts.confirm({
          message: `Do you wish to update the metadata with the new IPFS hash: ${epoch.hash}?`,
        })

        if (!confirmed) return
      }

      metadata.ipfsHashByEpoch[epoch.number] = epoch.hash

      const { IpfsHash } = await this.client.pinJSONToIPFS(metadata, {
        pinataMetadata: { name: 'rFoxMetadata.json' },
      })

      success(`Metadata updated (IPFS hash: ${IpfsHash})`)

      return IpfsHash
    }

    // TODO: manual update walkthrough

    return
  }

  async getMetadata(): Promise<RFOXMetadata> {
    const hash = await prompts.input({
      message: 'What is the IPFS hash for the rFOX metadata you wish to update? ',
    })

    try {
      const { data } = await axios.get(`${PINATA_GATEWAY_URL}/ipfs/${hash}`, {
        headers: {
          'x-pinata-gateway-token': PINATA_GATEWAY_API_KEY,
        },
      })

      if (isMetadata(data)) return data

      error(`The contents of IPFS hash (${hash}) are not valid, exiting.`)
      process.exit(1)
    } catch {
      error(`Failed to get content of IPFS hash (${hash}), exiting.`)
      process.exit(1)
    }
  }
}
