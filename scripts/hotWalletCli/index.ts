import fs from 'node:fs'
import path from 'node:path'
import * as prompts from '@inquirer/prompts'
import { create, recoverKeystore } from './mnemonic.js'
import { info, error, warn } from './logging.js'
import { createWallet, fund } from './wallet.js'
import { RFOX_DIR } from './constants.js'

const run = async () => {
  const { mnemonic, keystoreFile: keystore } = await create()

  info(`Encrypted keystore file created (${keystore})`)
  info('Please back up your mnemonic in another secure way in case keystore file recovery fails!')
  info(`Mnemonic: ${mnemonic}`)
  warn('DO NOT INTERACT WITH THIS WALLET FOR ANY REASON OUTSIDE OF THIS SCRIPT!')

  const confirmed = await prompts.confirm({
    message: 'Have you securely backed up your mnemonic? ',
  })

  if (!confirmed) {
    error('Unable to proceed knowing you have not securely backed up your mnemonic, exiting.')
    process.exit(1)
  }

  const wallet = await createWallet(mnemonic)

  // TODO: get total amount from distribution file (total distribution + fees to pay for all transactions)
  const amount = '1'

  await fund(wallet, amount)
}

const recover = async () => {
  const keystore = path.join(RFOX_DIR, 'keystore.txt')
  const mnemonic = await recoverKeystore(keystore)
  const wallet = await createWallet(mnemonic)

  // TODO: get total amount from distribution file (total distribution + fees to pay for all transactions)
  const amount = '1'

  await fund(wallet, amount)
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
      return await run()
    case 'recover':
      return await recover()
    default:
      error(`Invalid choice: ${choice}, exiting.`)
      process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main()
