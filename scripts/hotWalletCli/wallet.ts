import { bip32ToAddressNList } from '@shapeshiftoss/hdwallet-core'
import { NativeHDWallet } from '@shapeshiftoss/hdwallet-native'
import axios from 'axios'
import path from 'node:path'
import ora, { Ora } from 'ora'
import { Epoch } from '../types'
import { RFOX_DIR } from './constants'
import { read, write } from './file'
import { error, info, success } from './logging'

const BIP32_PATH = `m/44'/931'/0'/0/0`
const SHAPESHIFT_MULTISIG_ADDRESS = 'thor1xmaggkcln5m5fnha2780xrdrulmplvfrz6wj3l'
const THORNODE_URL = 'https://daemon.thorchain.shapeshift.com'

const addressNList = bip32ToAddressNList(BIP32_PATH)

type TxsByStakingAddress = Record<string, { signedTx: string; txId: string }>

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

    const { address, path } = await wallet.getAddress()

    info(`Hot wallet address: ${address} (${path})`)

    return wallet
  }

  private async initialize(): Promise<boolean | null> {
    return this.hdwallet.initialize()
  }

  private async getAddress() {
    const address = await this.hdwallet.thorchainGetAddress({ addressNList })

    if (!address) {
      error('Failed to get address from hot wallet, exiting.')
      process.exit(1)
    }

    return { address, path: BIP32_PATH }
  }

  private async buildFundingTransaction(amount: string, epoch: number) {
    const { address } = await this.getAddress()

    return {
      body: {
        messages: [
          {
            '@type': '/types.MsgSend',
            from_address: SHAPESHIFT_MULTISIG_ADDRESS,
            to_address: address,
            amount: [
              {
                denom: 'rune',
                amount,
              },
            ],
          },
        ],
        memo: `Fund rFOX rewards distribution - Epoch #${epoch}`,
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

  async fund(epoch: Epoch) {
    const { address } = await this.getAddress()

    const distributions = Object.values(epoch.distributionsByStakingAddress)

    const totalDistribution = distributions.reduce((prev, distribution) => {
      return prev + BigInt(distribution.amount)
    }, 0n)

    const totalFees = BigInt(2000000) * BigInt(distributions.length)

    const totalAmount = (totalDistribution + totalFees).toString()

    const isFunded = async (interval?: NodeJS.Timeout, spinner?: Ora, resolve?: () => void): Promise<boolean> => {
      const { data } = await axios.get<{ balance: { denom: string; amount: string } }>(
        `${THORNODE_URL}/lcd/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=rune`,
      )

      if (data.balance.amount !== totalAmount) {
        return false
      }

      spinner?.succeed()

      success('Hot wallet is funded and ready to distribute rewards.')

      clearInterval(interval)
      resolve && resolve()

      return true
    }

    if (await isFunded()) return

    const unsignedTx = await this.buildFundingTransaction(totalAmount, epoch.number)
    const unsignedTxFile = path.join(RFOX_DIR, `unsignedTx_epoch-${epoch.number}.json`)

    write(unsignedTxFile, JSON.stringify(unsignedTx, null, 2))
    success(`Unsigned funding transaction created (${unsignedTxFile})`)
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

  private async signTransactions(epoch: Epoch): Promise<TxsByStakingAddress> {
    const txsFile = path.join(RFOX_DIR, `txs_epoch-${epoch.number}.json`)
    const txs = read(txsFile)

    const txsByStakingAddress = await (async () => {
      if (txs) return JSON.parse(txs) as TxsByStakingAddress

      const { address } = await this.getAddress()

      const { data } = await axios.get<{ account: { account_number: string; sequence: string } }>(
        `${THORNODE_URL}/lcd/cosmos/auth/v1beta1/accounts/${address}`,
      )

      let i = 0
      const txsByStakingAddress: TxsByStakingAddress = {}
      try {
        for await (const [stakingAddress, distribution] of Object.entries(epoch.distributionsByStakingAddress)) {
          const unsignedTx = {
            account_number: data.account.account_number,
            addressNList,
            chain_id: 'thorchain-mainnet-v1',
            sequence: String(Number(data.account.sequence) + i),
            tx: {
              msg: [
                {
                  type: 'thorchain/MsgSend',
                  value: {
                    amount: [{ amount: distribution.amount, denom: 'rune' }],
                    from_address: address,
                    to_address: distribution.rewardAddress,
                  },
                },
              ],
              fee: {
                amount: [],
                gas: '0',
              },
              memo: `rFOX reward (Staking Address: ${stakingAddress}) - Epoch #${epoch.number}`,
              signatures: [],
            },
          }

          const signedTx = await this.hdwallet.thorchainSignTx(unsignedTx)

          if (!signedTx?.serialized) break

          txsByStakingAddress[stakingAddress] = {
            signedTx: signedTx.serialized,
            txId: '',
          }

          i++
        }
      } catch {}

      return txsByStakingAddress
    })()

    const totalTxs = Object.values(epoch.distributionsByStakingAddress).length
    const processedTxs = Object.values(txsByStakingAddress).filter(tx => !!tx.signedTx).length

    if (processedTxs !== totalTxs) {
      error(`${processedTxs}/${totalTxs} transactions signed, exiting.`)
      process.exit(1)
    }

    write(txsFile, JSON.stringify(txsByStakingAddress, null, 2))
    success(`${processedTxs}/${totalTxs} transactions signed.`)

    return txsByStakingAddress
  }

  async broadcastTransactions(epoch: Epoch, txsByStakingAddress: TxsByStakingAddress): Promise<Epoch> {
    try {
      for await (const [stakingAddress, { signedTx, txId }] of Object.entries(txsByStakingAddress)) {
        if (txId) {
          epoch.distributionsByStakingAddress[stakingAddress].txId = txId
          continue
        }

        const { data } = await axios.post<{ result: { hash: string } }>(`${THORNODE_URL}/rpc`, {
          jsonrpc: '2.0',
          id: stakingAddress,
          method: 'broadcast_tx_sync',
          params: { tx: signedTx },
        })

        if (!data.result.hash) continue

        txsByStakingAddress[stakingAddress].txId = data.result.hash
        epoch.distributionsByStakingAddress[stakingAddress].txId = data.result.hash
      }
    } catch {}

    const txsFile = path.join(RFOX_DIR, `txs_epoch-${epoch.number}.json`)
    write(txsFile, JSON.stringify(txsByStakingAddress, null, 2))

    const totalTxs = Object.values(epoch.distributionsByStakingAddress).length
    const processedTxs = Object.values(txsByStakingAddress).filter(tx => !!tx.txId).length

    if (processedTxs !== totalTxs) {
      error(`${processedTxs}/${totalTxs} transactions broadcasted, exiting.`)
      process.exit(1)
    }

    success(`${processedTxs}/${totalTxs} transactions broadcasted.`)

    return epoch
  }

  async distribute(epoch: Epoch): Promise<Epoch> {
    const txsByStakingAddress = await this.signTransactions(epoch)
    return this.broadcastTransactions(epoch, txsByStakingAddress)
  }
}
