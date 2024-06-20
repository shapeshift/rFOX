import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import * as prompts from '@inquirer/prompts'
import { generateMnemonic, validateMnemonic } from 'bip39'
import { error } from './logging.js'
import { RFOX_DIR } from './constants.js'

const recoveryChoices = [
  {
    name: 'Re-enter password',
    value: 'password',
    description: 'Provide your password to decrypt keystore file.',
  },
  {
    name: 'Custom keystore file',
    value: 'file',
    description: 'Provide a custom path to a local keystore file.',
  },
  {
    name: 'Manual mnemonic entry',
    value: 'mnemonic',
    description: 'Provide your mnemonic in plain text.',
  },
]

export const encryptMnemonic = (mnemonic: string, password: string): string => {
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = cipher.update(mnemonic, 'utf8', 'hex') + cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

const decryptMnemonic = (encryptedMnemonic: string, password: string): string | undefined => {
  try {
    const [ivHex, encryptedHex] = encryptedMnemonic.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')
    const key = crypto.scryptSync(password, 'salt', 32)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const decrypted = decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
    return decrypted
  } catch (err) {
    error('Failed to decrypt mnemonic.')
  }
}

export const create = async (): Promise<{
  mnemonic: string
  keystoreFile: string
}> => {
  const password = await prompts.password({
    message: 'Enter a password for encrypting keystore file: ',
    mask: true,
  })

  const password2 = await prompts.password({
    message: 'Re-enter your password: ',
    mask: true,
  })

  if (password !== password2) {
    error(`Your passwords don't match.`)
    process.exit(1)
  }

  const mnemonic = generateMnemonic()
  const encryptedMnemonic = encryptMnemonic(mnemonic, password)

  // TODO: save file as related to epoch
  const keystoreFile = path.join(RFOX_DIR, 'keystore.txt')

  fs.writeFileSync(keystoreFile, encryptedMnemonic, 'utf8')

  return { mnemonic, keystoreFile }
}

export const recoverKeystore = async (keystoreFile: string, attempt = 0): Promise<string> => {
  const encryptedMnemonic = (() => {
    try {
      return fs.readFileSync(keystoreFile, 'utf8')
    } catch (err) {
      error('No keystore file found.')
    }
  })()

  if (!encryptedMnemonic) {
    return recoveryChoice(
      attempt,
      recoveryChoices.filter(choice => choice.value !== 'password'),
    )
  }

  const password = await prompts.password({
    message: 'Enter password to decrypt your keystore file: ',
    mask: true,
  })

  const mnemonic = decryptMnemonic(encryptedMnemonic, password)

  if (!mnemonic) {
    return recoveryChoice(attempt, recoveryChoices, keystoreFile)
  }

  return mnemonic
}

const recoverMnemonic = async (mnemonic: string, attempt = 1): Promise<string> => {
  const valid = validateMnemonic(mnemonic)

  if (!valid) {
    error('Mnemonic not valid.')
    return recoveryChoice(attempt)
  }

  return mnemonic
}

const recoveryChoice = async (attempt: number, choices = recoveryChoices, keystoreFile = ''): Promise<string> => {
  if (attempt >= 2) {
    error('Failed to recover hot wallet, exiting.')
    process.exit(1)
  }

  const choice = await prompts.select({
    message: 'How do you want to recover your hot wallet?',
    choices,
  })

  switch (choice) {
    case 'password': {
      return recoverKeystore(keystoreFile, ++attempt)
    }
    case 'file': {
      const path = await prompts.input({
        message: `Enter absolute path to your keystore file (ex. /home/user/rfox/keystore.txt): `,
      })

      return recoverKeystore(path, ++attempt)
    }
    case 'mnemonic': {
      const mnemonic = await prompts.input({
        message: 'Enter your mnemonic: ',
      })

      return recoverMnemonic(mnemonic, ++attempt)
    }
    default:
      error(`Invalid choice: ${choice}, exiting.`)
      process.exit(1)
  }
}
