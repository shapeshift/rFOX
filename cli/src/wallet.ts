import { bip32ToAddressNList } from '@shapeshiftoss/hdwallet-core'
import { NativeHDWallet } from '@shapeshiftoss/hdwallet-native'
import axios, { isAxiosError } from 'axios'
import BigNumber from 'bignumber.js'
import chalk from 'chalk'
import symbols from 'log-symbols'
import path from 'node:path'
import ora, { Ora } from 'ora'
import { read, write } from './file'
import { error, info, success } from './logging'
import { Epoch } from './types'
import { RFOX_DIR } from '.'

const THORNODE_URL = process.env['THORNODE_URL']
if (!THORNODE_URL) {
  error('THORNODE_URL not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

const BIP32_PATH = `m/44'/931'/0'/0/0`
const SHAPESHIFT_MULTISIG_ADDRESS = 'thor122h9hlrugzdny9ct95z6g7afvpzu34s73uklju'

const addressNList = bip32ToAddressNList(BIP32_PATH)

type TxsByStakingAddress = Record<string, { signedTx: string; txId: string }>
type TxsByStakingContract = Record<string, TxsByStakingAddress>

const suffix = (text: string): string => {
  return `\n${symbols.error} ${chalk.bold.red(text)}`
}

export class Wallet {
  private hdwallet: NativeHDWallet

  constructor(mnemonic: string) {
    this.hdwallet = new NativeHDWallet({ mnemonic, deviceId: 'hot' })
  }

  static async new(mnemonic: string): Promise<Wallet> {
    try {
      const wallet = new Wallet(mnemonic)
      const initialized = await wallet.initialize()

      if (!initialized) {
        error('Failed to initialize hot wallet, exiting.')
        process.exit(1)
      }

      const { address, path } = await wallet.getAddress()

      info(`Hot wallet address: ${address} (${path})`)

      return wallet
    } catch {
      error('Failed to create hot wallet, exiting.')
      process.exit(1)
    }
  }

  private async initialize(): Promise<boolean | null> {
    return this.hdwallet.initialize()
  }

  private async getAddress() {
    try {
      const address = await this.hdwallet.thorchainGetAddress({ addressNList })

      if (!address) {
        error('Failed to get address from hot wallet, exiting.')
        process.exit(1)
      }

      return { address, path: BIP32_PATH }
    } catch {
      error('Failed to get address from hot wallet, exiting.')
      process.exit(1)
    }
  }

  private async buildFundingTransaction(amount: string, epoch: Epoch, hash: string) {
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
        memo: `Fund rFOX rewards distribution - Epoch #${epoch.number} (IPFS Hash: ${hash})`,
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

  async fund(epoch: Epoch, epochHash: string) {
    const { address } = await this.getAddress()

    const distributions = Object.values(epoch.detailsByStakingContract)
      .flatMap(details => Object.values(details.distributionsByStakingAddress))
      .filter(distribution => BigNumber(distribution.amount).gt(0))

    const totalDistribution = distributions.reduce((prev, distribution) => {
      return prev + BigInt(distribution.amount)
    }, 0n)

    const totalFees = BigInt(2000000) * BigInt(distributions.length)

    const totalAmount = (totalDistribution + totalFees).toString()

    const isFunded = async (interval?: NodeJS.Timeout, spinner?: Ora, resolve?: () => void): Promise<boolean> => {
      try {
        const { data } = await axios.get<{ result: { total_count: string } }>(
          `${THORNODE_URL}/rpc/tx_search?query="transfer.recipient='${address}' AND transfer.amount='${totalAmount}rune'"`,
        )

        if (data.result.total_count !== '1') {
          return false
        }

        spinner?.succeed('Hot wallet is funded and ready to distribute rewards.')

        clearInterval(interval)
        resolve && resolve()

        return true
      } catch (err) {
        spinner?.fail()

        if (isAxiosError(err)) {
          error(
            `Failed to verify if hot wallet is funded: ${err.request?.data?.message || err.response?.data?.message || err.message}, exiting.`,
          )
        } else {
          error('Failed to verify if hot wallet is funded, exiting.')
        }

        process.exit(1)
      }
    }

    if (await isFunded()) return

    const unsignedTx = await this.buildFundingTransaction(totalAmount, epoch, epochHash)
    const unsignedTxFile = path.join(RFOX_DIR, `unsignedTx_epoch-${epoch.number}.json`)

    write(unsignedTxFile, JSON.stringify(unsignedTx, null, 2))
    success(`Unsigned funding transaction created (${unsignedTxFile})`)

    info(
      'Follow the steps for signing and broadcasting the funding transaction as detailed here: https://github.com/shapeshift/rFOX/blob/main/cli/MultiSig.md',
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

  private async signTransactions(epoch: Epoch, epochHash: string): Promise<TxsByStakingContract> {
    const txsFile = path.join(RFOX_DIR, `txs_epoch-${epoch.number}.json`)
    const txs = read(txsFile)

    const distributions = Object.values(epoch.detailsByStakingContract)
      .flatMap(details => Object.values(details.distributionsByStakingAddress))
      .filter(distribution => BigNumber(distribution.amount).gt(0))

    const totalTxs = distributions.length
    const spinner = ora(`Signing ${totalTxs} transactions...`).start()

    const txsByStakingContract = await (async () => {
      if (txs) return JSON.parse(txs) as TxsByStakingContract

      const { address } = await this.getAddress()

      const account = await (async () => {
        try {
          const { data } = await axios.get<{ account: { account_number: string; sequence: string } }>(
            `${THORNODE_URL}/lcd/cosmos/auth/v1beta1/accounts/${address}`,
          )
          return data.account
        } catch (err) {
          spinner.fail()

          if (isAxiosError(err)) {
            error(
              `Failed to get account details: ${err.request?.data?.message || err.response?.data?.message || err.message}, exiting.`,
            )
          } else {
            error('Failed to get account details, exiting.')
          }

          process.exit(1)
        }
      })()

      let i = 0
      const txsByStakingContract: TxsByStakingContract = {}
      try {
        for (const [stakingContract, details] of Object.entries(epoch.detailsByStakingContract)) {
          txsByStakingContract[stakingContract] = {}

          for (const [stakingAddress, distribution] of Object.entries(details.distributionsByStakingAddress)) {
            if (!BigNumber(distribution.amount).gt(0)) continue

            const unsignedTx = {
              account_number: account.account_number,
              addressNList,
              chain_id: 'thorchain-1',
              sequence: String(Number(account.sequence) + i),
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
                memo: `rFOX reward (Staking Contract: ${stakingContract}, Staking Address: ${stakingAddress}) - Epoch #${epoch.number} (IPFS Hash: ${epochHash})`,
                signatures: [],
              },
            }

            const signedTx = await this.hdwallet.thorchainSignTx(unsignedTx)

            if (!signedTx?.serialized) {
              spinner.suffixText = suffix('Failed to sign transaction.')
              break
            }

            txsByStakingContract[stakingContract][stakingAddress] = {
              signedTx: signedTx.serialized,
              txId: '',
            }

            i++
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          spinner.suffixText = suffix(`Failed to sign transaction: ${err.message}.`)
        } else {
          spinner.suffixText = suffix('Failed to sign transaction.')
        }
      }

      return txsByStakingContract
    })()

    const processedTxs = Object.values(txsByStakingContract)
      .flatMap(txsByStakingAddress => Object.values(txsByStakingAddress))
      .filter(tx => !!tx.signedTx).length

    if (processedTxs !== totalTxs) {
      spinner.fail(`${processedTxs}/${totalTxs} transactions signed, exiting.`)
      process.exit(1)
    }

    write(txsFile, JSON.stringify(txsByStakingContract, null, 2))
    spinner.succeed(`${processedTxs}/${totalTxs} transactions signed.`)

    return txsByStakingContract
  }

  async broadcastTransactions(epoch: Epoch, txsByStakingContract: TxsByStakingContract): Promise<Epoch> {
    const distributions = Object.values(epoch.detailsByStakingContract)
      .flatMap(details => Object.values(details.distributionsByStakingAddress))
      .filter(distribution => BigNumber(distribution.amount).gt(0))

    const totalTxs = distributions.length
    const spinner = ora(`Broadcasting ${totalTxs} transactions...`).start()

    const doBroadcast = async (stakingAddress: string, signedTx: string, retryAttempt = 0) => {
      try {
        // delay between broadcast attempts to allow for transactions to confirm on chain
        await new Promise(resolve => setTimeout(resolve, 1000))

        const { data } = await axios.post<{ result: { code: number; data: string; log: string; hash: string } }>(
          `${THORNODE_URL}/rpc`,
          {
            jsonrpc: '2.0',
            id: stakingAddress,
            method: 'broadcast_tx_sync',
            params: { tx: signedTx },
          },
        )

        if (!data.result.hash || data.result.code !== 0) {
          if (retryAttempt >= 2) {
            spinner.suffixText = suffix(`Failed to broadcast transaction: ${data.result.data || data.result.log}.`)
            return
          }

          return doBroadcast(stakingAddress, signedTx, ++retryAttempt)
        }

        return data
      } catch (err) {
        if (retryAttempt >= 2) throw err
        return doBroadcast(stakingAddress, signedTx, ++retryAttempt)
      }
    }

    try {
      for (const [stakingContract, txsByStakingAddress] of Object.entries(txsByStakingContract)) {
        for (const [stakingAddress, { signedTx, txId }] of Object.entries(txsByStakingAddress)) {
          if (txId) {
            epoch.detailsByStakingContract[stakingContract].distributionsByStakingAddress[stakingAddress].txId = txId
            continue
          }

          const data = await doBroadcast(stakingAddress, signedTx)
          if (!data) break

          txsByStakingContract[stakingContract][stakingAddress].txId = data.result.hash
          epoch.detailsByStakingContract[stakingContract].distributionsByStakingAddress[stakingAddress].txId =
            data.result.hash
        }
      }
    } catch (err) {
      if (isAxiosError(err)) {
        spinner.suffixText = suffix(
          `Failed to broadcast transaction: ${err.request?.data?.message || err.response?.data?.message || err.message}.`,
        )
      } else {
        spinner.suffixText = suffix('Failed to broadcast transaction.')
      }
    }

    const txsFile = path.join(RFOX_DIR, `txs_epoch-${epoch.number}.json`)
    write(txsFile, JSON.stringify(txsByStakingContract, null, 2))

    const processedTxs = Object.values(txsByStakingContract)
      .flatMap(txsByStakingAddress => Object.values(txsByStakingAddress))
      .filter(tx => !!tx.signedTx).length

    if (processedTxs !== totalTxs) {
      spinner.fail(`${processedTxs}/${totalTxs} transactions broadcasted, exiting.`)
      process.exit(1)
    }

    spinner.succeed(`${processedTxs}/${totalTxs} transactions broadcasted.`)

    return epoch
  }

  async distribute(epoch: Epoch, epochHash: string): Promise<Epoch> {
    const txsByStakingContract = await this.signTransactions(epoch, epochHash)
    return this.broadcastTransactions(epoch, txsByStakingContract)
  }
}
