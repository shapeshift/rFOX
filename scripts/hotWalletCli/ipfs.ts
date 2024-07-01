import * as prompts from '@inquirer/prompts'
import { create, IPFSHTTPClient } from 'ipfs-http-client'
import { Epoch, RewardDistribution } from '../types'
import { error, info } from './logging'

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
  private ipfs: IPFSHTTPClient

  constructor(ipfs: IPFSHTTPClient) {
    this.ipfs = ipfs
  }

  static async new(): Promise<Client> {
    try {
      const ipfs = create()
      return new Client(ipfs)
    } catch (err) {
      error('Failed to connect to IPFS, exiting.')
      process.exit(1)
    }
  }

  async addEpoch(epoch: Epoch): Promise<string> {
    const buffer = Buffer.from(JSON.stringify(epoch))
    const { cid } = await this.ipfs.add(buffer)

    return cid.toString()
  }

  async getEpoch(): Promise<Epoch> {
    const cid = await prompts.input({
      message: 'What is the IPFS CID for the rFOX distribution epoch you wish to process? ',
    })

    const decoder = new TextDecoder()

    let content = ''
    for await (const chunk of this.ipfs.cat(cid)) {
      content += decoder.decode(chunk, { stream: true })
    }

    const epoch = JSON.parse(content)

    if (isEpoch(epoch)) {
      info(`Processing rFOX distribution for Epoch #${epoch.number}.`)
      return epoch
    } else {
      error(`The contents of IPFS CID (${cid}) are not valid, exiting.`)
      process.exit(1)
    }
  }

  async updateMetadata(cid: string) {}
}
