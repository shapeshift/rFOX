import * as prompts from '@inquirer/prompts'
import PinataClient from '@pinata/sdk'
import axios from 'axios'
import { Epoch, RewardDistribution } from '../types'
import { error, info } from './logging'

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

export function isRewardDistribution(obj: any): obj is RewardDistribution {
  return (
    typeof obj.amount === 'string' &&
    typeof obj.rewardUnits === 'string' &&
    typeof obj.txId === 'string' &&
    typeof obj.rewardAddress === 'string'
  )
}

export function isEpoch(obj: any): obj is Epoch {
  if (typeof obj !== 'object' || obj === null) return false

  return (
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
    obj.distributionsByStakingAddress !== null &&
    Object.values(obj.distributionsByStakingAddress).every(isRewardDistribution)
  )
}

export class Client {
  private pinata: PinataClient

  constructor(pinata: PinataClient) {
    this.pinata = pinata
  }

  static async new(): Promise<Client> {
    try {
      const pinata = new PinataClient({ pinataApiKey: PINATA_API_KEY, pinataSecretApiKey: PINATA_SECRET_API_KEY })
      await pinata.testAuthentication()
      return new Client(pinata)
    } catch (err) {
      error('Failed to connect to IPFS, exiting.')
      process.exit(1)
    }
  }

  async addEpoch(epoch: Epoch): Promise<string> {
    const { IpfsHash } = await this.pinata.pinJSONToIPFS(epoch, {
      pinataMetadata: { name: `rFoxEpoch${epoch.number}.json` },
    })

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
}
