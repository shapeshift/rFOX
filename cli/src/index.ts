import 'dotenv/config'
import * as prompts from '@inquirer/prompts'
import BigNumber from 'bignumber.js'
import fs from 'node:fs'
import path from 'node:path'
import ora from 'ora'
import { Client } from './client'
import { MONTHS, RFOX_DIR } from './constants'
import { isEpochDistributionStarted } from './file'
import { IPFS } from './ipfs'
import { error, info, success, warn } from './logging'
import { create, recoverKeystore } from './mnemonic'
import { Epoch } from './types'
import { Wallet } from './wallet'

const processEpoch = async () => {
  const ipfs = await IPFS.new()
  const client = await Client.new()

  const metadata = await ipfs.getMetadata('process')

  const month = MONTHS[new Date(metadata.epochStartTimestamp).getUTCMonth()]

  info(`Processing Epoch #${metadata.epoch} for ${month} distribution.`)

  const now = Date.now()
  if (metadata.epochEndTimestamp > now) {
    const daysRemaining = Math.round((metadata.epochEndTimestamp - now) / (24 * 60 * 60 * 1000))
    error(`${daysRemaining} days remaining in the current epoch, exiting.`)
    process.exit(1)
  }

  const revenue = await client.getRevenue(metadata.epochStartTimestamp, metadata.epochEndTimestamp)

  info(
    `Total ${month} revenue earned by ${revenue.address}: ${BigNumber(revenue.amount).div(100000000).toFixed(8)} RUNE`,
  )

  info(`Share of total revenue to be distributed as rewards: ${metadata.distributionRate * 100}%`)
  info(`Share of total revenue to buy back fox and burn: ${metadata.burnRate * 100}%`)

  const totalDistribution = BigNumber(BigNumber(revenue.amount).times(metadata.distributionRate).toFixed(0))

  info(`Total rewards to be distributed: ${totalDistribution.div(100000000).toFixed()} RUNE`)

  const spinner = ora('Detecting epoch start and end blocks...').start()

  const startBlock = await client.getBlockByTimestamp(
    BigInt(Math.floor(metadata.epochStartTimestamp / 1000)),
    'earliest',
    spinner,
  )

  const endBlock = await client.getBlockByTimestamp(
    BigInt(Math.floor(metadata.epochEndTimestamp / 1000)),
    'latest',
    spinner,
  )

  spinner.succeed()

  info(`Start Block: ${startBlock}`)
  info(`End Block: ${endBlock}`)

  const secondsInEpoch = BigInt(Math.floor((metadata.epochEndTimestamp - metadata.epochStartTimestamp) / 1000))

  const { totalRewardUnits, distributionsByStakingAddress } = await client.calculateRewards(
    startBlock,
    endBlock,
    secondsInEpoch,
    totalDistribution,
  )

  const epochHash = await ipfs.addEpoch({
    number: metadata.epoch,
    startTimestamp: metadata.epochStartTimestamp,
    endTimestamp: metadata.epochEndTimestamp,
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
    totalRevenue: revenue.amount,
    totalRewardUnits,
    distributionRate: metadata.distributionRate,
    burnRate: metadata.burnRate,
    treasuryAddress: metadata.treasuryAddress,
    distributionStatus: 'pending',
    distributionsByStakingAddress,
  })

  const nextEpochStartDate = new Date(metadata.epochEndTimestamp + 1)

  await ipfs.updateMetadata(metadata, {
    epoch: { number: metadata.epoch, hash: epochHash },
    metadata: {
      epoch: metadata.epoch + 1,
      epochStartTimestamp: nextEpochStartDate.getTime(),
      epochEndTimestamp: Date.UTC(nextEpochStartDate.getUTCFullYear(), nextEpochStartDate.getUTCMonth() + 1) - 1,
    },
  })

  success(`rFOX Epoch #${metadata.epoch} has been processed!`)

  info(
    'Please update the rFOX Wiki (https://github.com/shapeshift/rFOX/wiki/rFOX-Metadata) and notify the DAO accordingly. Thanks!',
  )
}

const run = async () => {
  const ipfs = await IPFS.new()

  const epoch = await ipfs.getEpoch()

  if (isEpochDistributionStarted(epoch.number)) {
    const confirmed = await prompts.confirm({
      message: 'It looks like you have already started a distribution for this epoch. Do you want to continue? ',
    })

    if (confirmed) return recover(epoch)

    info(`Please move or delete all existing files for epoch-${epoch.number} from ${RFOX_DIR} before re-running.`)
    warn('This action should never be taken unless you are absolutely sure you know what you are doing!!!')

    process.exit(0)
  }

  const mnemonic = await create(epoch.number)

  const confirmed = await prompts.confirm({
    message: 'Have you securely backed up your mnemonic? ',
  })

  if (!confirmed) {
    error('Unable to proceed knowing you have not securely backed up your mnemonic, exiting.')
    process.exit(1)
  }

  const wallet = await Wallet.new(mnemonic)

  await processDistribution(epoch, wallet, ipfs)
}

const recover = async (epoch?: Epoch) => {
  const ipfs = await IPFS.new()

  if (!epoch) epoch = await ipfs.getEpoch()

  const keystoreFile = path.join(RFOX_DIR, `keystore_epoch-${epoch.number}.txt`)
  const mnemonic = await recoverKeystore(keystoreFile)

  const wallet = await Wallet.new(mnemonic)

  await processDistribution(epoch, wallet, ipfs)
}

const processDistribution = async (epoch: Epoch, wallet: Wallet, ipfs: IPFS) => {
  await wallet.fund(epoch)
  const processedEpoch = await wallet.distribute(epoch)

  const processedEpochHash = await ipfs.addEpoch(processedEpoch)
  const metadata = await ipfs.getMetadata('update')

  await ipfs.updateMetadata(metadata, { epoch: { number: processedEpoch.number, hash: processedEpochHash } })

  success(`rFOX reward distribution for Epoch #${processedEpoch.number} has been completed!`)

  info(
    'Please update the rFOX Wiki (https://github.com/shapeshift/rFOX/wiki/rFOX-Metadata) and notify the DAO accordingly. Thanks!',
  )
}

const shutdown = () => {
  console.log()
  warn('Received shutdown signal, exiting.')
  process.exit(0)
}

const main = async () => {
  try {
    fs.mkdirSync(RFOX_DIR)
  } catch (err) {
    if (err instanceof Error) {
      const fsError = err as NodeJS.ErrnoException
      if (fsError.code !== 'EEXIST') throw err
    }
  }

  const choice = await prompts.select<'process' | 'run' | 'recover'>({
    message: 'What do you want to do?',
    choices: [
      {
        name: 'Process rFox epoch',
        value: 'process',
        description: 'Start here to process a completed rFox epoch',
      },
      {
        name: 'Run rFox distribution',
        value: 'run',
        description: 'Start here to begin running a new rFox rewards distribution',
      },
      {
        name: 'Recover rFox distribution',
        value: 'recover',
        description: 'Start here to recover an in progress rFox rewards distribution',
      },
    ],
  })

  switch (choice) {
    case 'process':
      return processEpoch()
    case 'run':
      return run()
    case 'recover':
      return recover()
    default:
      error(`Invalid choice: ${choice}, exiting.`)
      process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main()
