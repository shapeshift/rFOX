import * as prompts from '@inquirer/prompts'
import { create, recoverKeystore, KEYSTORE_FILE_PATH } from './mnemonic.js'
import { info, error } from './output.js'

async function run() {
  const { mnemonic, keystore } = await create()

  info(`Encrypted keystore file created (${keystore})`)
  info('Please back up your mnemonic in another secure way in case keystore file recovery fails!')
  info(`Mnemonic: ${mnemonic}`)

  const confirmed = await prompts.confirm({
    message: 'Have you securely backed up your mnemonic? ',
  })

  if (!confirmed) {
    error('Unable to proceed knowing you have not securely backed up your mnemonic, exiting.')
    process.exit(1)
  }
}

async function recover() {
  const mnemonic = await recoverKeystore(KEYSTORE_FILE_PATH)

  console.log({ mnemonic })
}

const main = async () => {
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

main()
