import 'dotenv/config'
import * as prompts from '@inquirer/prompts'
import fs from 'node:fs'
import path from 'node:path'
import { Epoch } from '../types'
import { RFOX_DIR } from './constants'
import { isEpochDistributionStarted } from './file'
import { IPFS } from './ipfs'
import { error, info, success, warn } from './logging'
import { create, recoverKeystore } from './mnemonic'
import { Wallet } from './wallet'

const run = async () => {
  const ipfs = await IPFS.new()

  const epoch = await ipfs.getEpoch()

  if (isEpochDistributionStarted(epoch.number)) {
    const cont = await prompts.confirm({
      message: 'It looks like you have already started a distribution for this epoch. Do you want to continue? ',
    })

    if (cont) return recover(epoch)

    warn(`Please move or delete all existing files for epoch-${epoch.number} from ${RFOX_DIR} before re-running.`)
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

  await processEpoch(epoch, wallet, ipfs)
}

const recover = async (epoch?: Epoch) => {
  const ipfs = await IPFS.new()

  if (!epoch) epoch = await ipfs.getEpoch()

  const keystoreFile = path.join(RFOX_DIR, `keystore_epoch-${epoch.number}.txt`)
  const mnemonic = await recoverKeystore(keystoreFile)

  const wallet = await Wallet.new(mnemonic)

  await processEpoch(epoch, wallet, ipfs)
}

const processEpoch = async (epoch: Epoch, wallet: Wallet, ipfs: IPFS) => {
  await wallet.fund(epoch)
  const processedEpoch = await wallet.distribute(epoch)

  const processedEpochHash = await ipfs.addEpoch(processedEpoch)
  await ipfs.updateMetadata({ number: processedEpoch.number, hash: processedEpochHash })

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

  const choice = await prompts.select<'run' | 'recover'>({
    message: 'What do you want to do?',
    choices: [
      {
        name: 'Run rFox distribution',
        value: 'run',
        description: 'Start here to process a new rFox distribution epoch',
      },
      {
        name: 'Recover rFox distribution',
        value: 'recover',
        description: 'Use this to recover from an error during an rFox distribution epoch',
      },
    ],
  })

  switch (choice) {
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
