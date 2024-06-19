import * as prompts from '@inquirer/prompts'
import { generateMnemonic, validateMnemonic } from 'bip39'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { error } from './output.js'

export const KEYSTORE_FILE_PATH = 'keystore.txt'

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
  keystore: string
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

  // save file as related to epoch
  fs.writeFileSync(KEYSTORE_FILE_PATH, encryptedMnemonic, 'utf8')

  return { mnemonic, keystore: KEYSTORE_FILE_PATH }
}

const readKeystore = (path: string): string | undefined => {
  try {
    return fs.readFileSync(path, 'utf8')
  } catch (err) {
    error('No keystore file found.')
  }
}

export const recoverKeystore = async (path: string, attempt = 0): Promise<string> => {
  const encryptedMnemonic = readKeystore(path)

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
    return recoveryChoice(attempt)
  }

  return mnemonic
}

const recoverMnemonic = async (mnemonic: string, attempt = 1): Promise<string> => {
  const valid = validateMnemonic(mnemonic)

  if (!valid) {
    return recoveryChoice(attempt)
  }

  return mnemonic
}

const recoveryChoice = async (attempt: number, choices = recoveryChoices): Promise<string> => {
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
      return recoverKeystore(KEYSTORE_FILE_PATH, ++attempt)
    }
    case 'file': {
      const path = await prompts.input({
        message: 'Enter absolute path to your keystore file (ex. /home/user/keystore.txt): ',
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
