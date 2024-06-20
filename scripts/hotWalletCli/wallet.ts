import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import ora, { Ora } from 'ora'
import { bip32ToAddressNList } from '@shapeshiftoss/hdwallet-core'
import { NativeHDWallet } from '@shapeshiftoss/hdwallet-native'
import { error, info } from './logging.js'
import { BIP32_PATH, RFOX_DIR, SHAPESHIFT_MULTISIG_ADDRESS, THORNODE_URL } from './constants.js'

export class Wallet {
  private hdwallet: NativeHDWallet

  constructor(mnemonic: string) {
    this.hdwallet = new NativeHDWallet({ mnemonic, deviceId: 'hot' })
  }

  static async new(mnemonic: string): Promise<Wallet> {
    const wallet = new Wallet(mnemonic)
    const initialized = await wallet.initialize()

    if (!initialized) {
      error('Failed to initialize hot wallet, exiting.')
      process.exit(1)
    }

    return wallet
  }

  async initialize(): Promise<boolean | null> {
    return this.hdwallet.initialize()
  }

  async getAddress() {
    const address = await this.hdwallet.thorchainGetAddress({ addressNList: bip32ToAddressNList(BIP32_PATH) })

    if (!address) {
      error('Failed to get address from hot wallet, exiting.')
      process.exit(1)
    }

    return { address, path: BIP32_PATH }
  }

  async buildFundingTransaction(amount: string) {
    const { address } = await this.getAddress()

    return {
      body: {
        messages: [
          {
            '@type': '/types.MsgSend',
            //from_address: SHAPESHIFT_MULTISIG_ADDRESS,
            from_address: 'thor10prpfj07j6a7rvtd5tfqhdzp8xsypzatfrc2v5',
            to_address: address,
            amount: [
              {
                denom: 'rune',
                amount,
              },
            ],
          },
        ],
        memo: 'rFOX distribution funding (epoch test)',
        timeout_height: '0',
        extension_options: [],
        non_critical_extension_options: [],
      },
      auth_info: {
        signer_infos: [],
        fee: {
          amount: [],
          gas_limit: '0',
          payer: '',
          granter: '',
        },
      },
      signatures: [],
    }
  }
}

export const createWallet = async (mnemonic: string): Promise<Wallet> => {
  const wallet = await Wallet.new(mnemonic)

  const { address, path } = await wallet.getAddress()

  info(`Hot wallet address: ${address} (${path})`)

  return wallet
}

export const fund = async (wallet: Wallet, amount: string) => {
  const { address } = await wallet.getAddress()

  const isFunded = async (interval?: NodeJS.Timeout, spinner?: Ora, resolve?: () => void): Promise<boolean> => {
    const { data } = await axios.get<{ balance: { denom: string; amount: string } }>(
      `${THORNODE_URL}/lcd/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=rune`,
    )

    if (data.balance.amount !== amount) return false

    spinner?.succeed()

    info('Hot wallet is funded and ready to distribute rewards.')

    clearInterval(interval)
    resolve && resolve()

    return true
  }

  if (await isFunded()) return

  const unsignedTx = await wallet.buildFundingTransaction(amount)
  const unsignedTxFile = path.join(RFOX_DIR, 'unsigned_tx.json')

  fs.writeFileSync(unsignedTxFile, JSON.stringify(unsignedTx, null, 2), 'utf8')

  info(`Unsigned funding transaction created (${unsignedTxFile})`)
  info(
    `Follow the steps for signing and broadcasting the funding transaction as detailed here: https://github.com/shapeshift/rFOX/blob/main/scripts/hotWalletCli/MultiSig.md`,
  )

  const spinner = ora('Waiting for hot wallet to be funded...').start()

  await (async () => {
    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        isFunded(interval, spinner, resolve)
      }, 30_000)
    })
  })()
}
