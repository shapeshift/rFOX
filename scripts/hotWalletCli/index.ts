import 'dotenv/config'
import * as prompts from '@inquirer/prompts'
import fs from 'node:fs'
import path from 'node:path'
import { Epoch } from '../types'
import { RFOX_DIR } from './constants'
import { isEpochDistributionStarted } from './file'
import { Client } from './ipfs'
import { error, warn } from './logging'
import { create, recoverKeystore } from './mnemonic'
import { Wallet } from './wallet'

const run = async () => {
  const ipfs = await Client.new()

  const epoch = await ipfs.getEpoch()

  if (isEpochDistributionStarted(epoch.number)) {
    const cont = await prompts.confirm({
      message: 'It looks like you have already started a distribution for this epoch. Do you want to continue? ',
    })

    if (cont) return recover(epoch)
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
  await wallet.fund(epoch)
  await wallet.distribute(epoch)
}

const recover = async (epoch?: Epoch) => {
  if (!epoch) {
    const ipfs = await Client.new()
    epoch = await ipfs.getEpoch()
  }

  const keystoreFile = path.join(RFOX_DIR, `keystore_epoch-${epoch.number}.txt`)
  const mnemonic = await recoverKeystore(keystoreFile)

  const wallet = await Wallet.new(mnemonic)
  await wallet.fund(epoch)
  await wallet.distribute(epoch)
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
