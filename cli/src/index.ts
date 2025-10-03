import 'dotenv/config'
import * as prompts from '@inquirer/prompts'
import BigNumber from 'bignumber.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ora from 'ora'
import { Client, stakingContracts } from './client'
import { MONTHS } from './constants'
import { isEpochDistributionStarted } from './file'
import { IPFS } from './ipfs'
import { error, info, success, warn } from './logging'
import { create, recoverKeystore } from './mnemonic'
import { Epoch, EpochDetails, RFOXMetadata } from './types'
import { Wallet } from './wallet'
import { Command } from 'commander'

const program = new Command()

program.name('rFOX CLI')
program.description('Here to help you do all things rFOX')
program.option('--rfoxDir <path>', 'path to rfox directory', '~/rfox')
program.parse(process.argv)

const options = program.opts()
export const RFOX_DIR = options.rfoxDir.replace(/^~(?=$|\/|\\)/, os.homedir())

const processEpoch = async () => {
  const ipfs = await IPFS.new()
  const client = await Client.new()

  const metadata = await ipfs.getMetadata('process')

  const month = MONTHS[new Date(metadata.epochStartTimestamp).getUTCMonth()]

  info(`Processing rFOX Epoch #${metadata.epoch} for ${month} distribution.`)

  const now = Date.now()
  if (metadata.epochEndTimestamp > now) {
    const daysRemaining = Math.round((metadata.epochEndTimestamp - now) / (24 * 60 * 60 * 1000))
    error(`${daysRemaining} days remaining in the current epoch, exiting.`)
    process.exit(1)
  }

  const revenue = await client.getRevenue(metadata.epochStartTimestamp, metadata.epochEndTimestamp)

  info(`Affilate addresses:`)
  revenue.addresses.forEach(address => info(`\t- ${address}`))

  info(`Total revenue earned by denom:`)
  Object.entries(revenue.revenue).forEach(([denom, amount]) => {
    info(`\t- ${BigNumber(amount).div(100000000).toFixed(8)} ${denom}`)
  })

  info(`Total revenue in RUNE: ${BigNumber(revenue.amount).div(100000000).toFixed(8)}`)

  const totalDistributionRate = Object.entries(metadata.distributionRateByStakingContract).reduce(
    (prev, [stakingContract, distributionRate]) => {
      const totalDistribution = BigNumber(BigNumber(revenue.amount).times(distributionRate).toFixed(0))
      info(
        `Staking Contract ${stakingContract}:\n\t- Share of total revenue to be distributed as rewards: ${distributionRate * 100}%\n\t- Total rewards to be distributed: ${totalDistribution.div(100000000).toFixed()} RUNE`,
      )
      return prev + distributionRate
    },
    0,
  )

  info(`Share of total revenue to be distributed as rewards: ${totalDistributionRate * 100}%`)
  const totalDistribution = BigNumber(BigNumber(revenue.amount).times(totalDistributionRate).toFixed(0))
  info(`Total rewards to be distributed: ${totalDistribution.div(100000000).toFixed()} RUNE`)

  info(`Share of total revenue to buy back fox and burn: ${metadata.burnRate * 100}%`)
  const totalBurn = BigNumber(BigNumber(revenue.amount).times(metadata.burnRate).toFixed(0))
  info(`Total amount to be used to buy back fox and burn: ${totalBurn.div(100000000).toFixed()} RUNE`)

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

  const { assetPriceUsd, runePriceUsd } = await client.getPrice()

  const detailsByStakingContract: Record<string, EpochDetails> = {}
  for (const stakingContract of stakingContracts) {
    const distributionRate = metadata.distributionRateByStakingContract[stakingContract] ?? 0

    const { totalRewardUnits, distributionsByStakingAddress } = await client.calculateRewards({
      stakingContract,
      startBlock,
      endBlock,
      secondsInEpoch,
      distributionRate,
      totalRevenue: revenue.amount,
    })

    detailsByStakingContract[stakingContract] = {
      assetPriceUsd: assetPriceUsd[stakingContract],
      distributionRate,
      distributionsByStakingAddress,
      totalRewardUnits,
    }
  }

  const epochHash = await ipfs.addEpoch({
    number: metadata.epoch,
    startTimestamp: metadata.epochStartTimestamp,
    endTimestamp: metadata.epochEndTimestamp,
    distributionTimestamp: metadata.epochEndTimestamp + 1,
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
    treasuryAddress: metadata.treasuryAddress,
    totalRevenue: revenue.amount,
    revenue: revenue.revenue,
    burnRate: metadata.burnRate,
    runePriceUsd,
    distributionStatus: 'pending',
    detailsByStakingContract,
  })

  const nextEpochStartDate = new Date(metadata.epochEndTimestamp + 1)

  const hash = await ipfs.updateMetadata(Object.assign({}, metadata), {
    epoch: { number: metadata.epoch, hash: epochHash },
    metadata: {
      epoch: metadata.epoch + 1,
      epochStartTimestamp: nextEpochStartDate.getTime(),
      epochEndTimestamp: Date.UTC(nextEpochStartDate.getUTCFullYear(), nextEpochStartDate.getUTCMonth() + 1) - 1,
    },
  })

  if (!hash) return

  success(`rFOX Epoch #${metadata.epoch} has been processed!`)

  info(
    'Please update the rFOX Wiki (https://github.com/shapeshift/rFOX/wiki/rFOX-Metadata) and notify the DAO accordingly. Thanks!',
  )
  warn(
    'Important: CURRENT_EPOCH_METADATA_IPFS_HASH must be updated in web (https://github.com/shapeshift/web/blob/develop/src/pages/RFOX/constants.ts).',
  )
}

const run = async () => {
  const ipfs = await IPFS.new()

  const metadata = await ipfs.getMetadata('process')
  const epoch = await ipfs.getEpochFromMetadata(metadata)

  if (isEpochDistributionStarted(epoch.number)) {
    const confirmed = await prompts.confirm({
      message: 'It looks like you have already started a distribution for this epoch. Do you want to continue? ',
    })

    if (confirmed) return recover(metadata)

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

  await processDistribution(metadata, epoch, wallet, ipfs)
}

const recover = async (metadata?: RFOXMetadata) => {
  const ipfs = await IPFS.new()

  if (!metadata) {
    metadata = await ipfs.getMetadata('process')
  }

  const epoch = await ipfs.getEpochFromMetadata(metadata)

  const keystoreFile = path.join(RFOX_DIR, `keystore_epoch-${epoch.number}.txt`)
  const mnemonic = await recoverKeystore(keystoreFile)

  const wallet = await Wallet.new(mnemonic)

  await processDistribution(metadata, epoch, wallet, ipfs)
}

const update = async () => {
  const ipfs = await IPFS.new()

  const metadata = await ipfs.getMetadata('update')
  const hash = await ipfs.updateMetadata(metadata)

  if (!hash) return

  success(`rFOX metadata has been updated!`)

  info(
    'Please update the rFOX Wiki (https://github.com/shapeshift/rFOX/wiki/rFOX-Metadata) and notify the DAO accordingly. Thanks!',
  )
  warn(
    'Important: CURRENT_EPOCH_METADATA_IPFS_HASH must be updated in web (https://github.com/shapeshift/web/blob/develop/src/pages/RFOX/constants.ts).',
  )
}

const migrate = async () => {
  const ipfs = await IPFS.new()

  const metadata = await ipfs.migrate()
  const hash = await ipfs.updateMetadata(metadata)

  if (!hash) return

  success(`rFOX metadata has been updated!`)

  info(
    'Please update the rFOX Wiki (https://github.com/shapeshift/rFOX/wiki/rFOX-Metadata) and notify the DAO accordingly. Thanks!',
  )
  warn(
    'Important: CURRENT_EPOCH_METADATA_IPFS_HASH must be updated in web (https://github.com/shapeshift/web/blob/develop/src/pages/RFOX/constants.ts).',
  )
}

const processDistribution = async (metadata: RFOXMetadata, epoch: Epoch, wallet: Wallet, ipfs: IPFS) => {
  const client = await Client.new()

  const epochHash = metadata.ipfsHashByEpoch[epoch.number]

  await wallet.fund(epoch, epochHash)
  const processedEpoch = await wallet.distribute(epoch, epochHash)

  const { assetPriceUsd, runePriceUsd } = await client.getPrice()

  processedEpoch.runePriceUsd = runePriceUsd
  processedEpoch.distributionStatus = 'complete'
  processedEpoch.distributionTimestamp = Date.now()
  stakingContracts.forEach(stakingContract => {
    processedEpoch.detailsByStakingContract[stakingContract].assetPriceUsd = assetPriceUsd[stakingContract]
  })

  const processedEpochHash = await ipfs.addEpoch(processedEpoch)

  const metadataHash = await ipfs.updateMetadata(metadata, {
    epoch: { number: processedEpoch.number, hash: processedEpochHash },
  })

  if (!metadataHash) return

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

  const choice = await prompts.select<'process' | 'run' | 'recover' | 'update' | 'migrate'>({
    message: 'What do you want to do?',
    choices: [
      {
        name: 'Process rFOX epoch',
        value: 'process',
        description: 'Start here to process an rFOX epoch.',
      },
      {
        name: 'Run rFOX distribution',
        value: 'run',
        description: 'Start here to run an rFOX rewards distribution.',
      },
      {
        name: 'Recover rFOX distribution',
        value: 'recover',
        description: 'Start here to recover an rFOX rewards distribution.',
      },
      {
        name: 'Update rFOX metadata',
        value: 'update',
        description: 'Start here to update an rFOX metadata.',
      },
      {
        name: 'Migrate rFOX metadata',
        value: 'migrate',
        description: 'Start here to migrate an existing rFOX metadata to the new format.',
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
    case 'update':
      return update()
    case 'migrate':
      return migrate()
    default:
      error(`Invalid choice: ${choice}, exiting.`)
      process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main()
