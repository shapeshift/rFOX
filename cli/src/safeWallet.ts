import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import type { MetaTransactionData, SafeTransaction } from '@safe-global/types-kit'
import { OperationType } from '@safe-global/types-kit'
import { SignClient } from '@walletconnect/sign-client'
import BigNumber from 'bignumber.js'
import chalk from 'chalk'
import path from 'node:path'
import ora, { type Ora } from 'ora'
import pino from 'pino'
import { encodeFunctionData, erc20Abi } from 'viem'
import { arbitrum } from 'viem/chains'
import { ARBITRUM_CHAIN_ID, ARBITRUM_SAFE_ADDRESS, ARBITRUM_USDC_ADDRESS, UNCHAINED_ARBITRUM_URL } from './constants'
import { read, write } from './file'
import { RFOX_DIR } from './index'
import { error, info } from './logging'
import type { Epoch, RewardDistribution } from './types'

const SAFE_API_KEY = process.env['SAFE_API_KEY']
const WALLETCONNECT_PROJECT_ID = process.env['WALLETCONNECT_PROJECT_ID']

if (!SAFE_API_KEY) {
  error('SAFE_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

if (!WALLETCONNECT_PROJECT_ID) {
  error('WALLETCONNECT_PROJECT_ID not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

type SafeTransactionState = {
  safeTxId: string
  executionTxId: string
}

export class SafeWallet {
  private api: SafeApiKit
  private safe: Safe

  constructor(safe: Safe) {
    this.api = new SafeApiKit({ chainId: BigInt(arbitrum.id), apiKey: SAFE_API_KEY })
    this.safe = safe
  }

  static async new(): Promise<SafeWallet> {
    try {
      const safe = await Safe.init({
        provider: `${UNCHAINED_ARBITRUM_URL}/api/v1/jsonrpc`,
        safeAddress: ARBITRUM_SAFE_ADDRESS,
      })

      return new SafeWallet(safe)
    } catch (err) {
      error('Failed to create safe wallet, exiting.')
      process.exit(1)
    }
  }

  async distribute(epoch: Epoch): Promise<Epoch> {
    const spinner = ora()

    try {
      const distributions = Object.values(epoch.detailsByStakingContract)
        .flatMap(details => Object.values(details.distributionsByStakingAddress))
        .filter(distribution => BigNumber(distribution.amount).gt(0))

      const stateFile = path.join(RFOX_DIR, `state_epoch-${epoch.number}.json`)
      const stateData = read(stateFile)

      let state: SafeTransactionState

      if (stateData) {
        state = JSON.parse(stateData)
      } else {
        const safeTransaction = await this.createSafeTransaction(distributions, spinner)
        const safeTxId = await this.sendTransaction(safeTransaction, spinner)

        state = {
          safeTxId,
          executionTxId: '',
        }

        write(stateFile, JSON.stringify(state, null, 2))
      }

      const safeUILink = `https://app.safe.global/transactions/tx?safe=arb1:${ARBITRUM_SAFE_ADDRESS}&id=multisig_${ARBITRUM_SAFE_ADDRESS}_${state.safeTxId}`
      info(`View in Safe UI: ${chalk.blue(safeUILink)}`)

      spinner.start('Polling for execution...')

      const executionTxId = await this.pollForExecution(state.safeTxId, spinner)
      state.executionTxId = executionTxId

      write(stateFile, JSON.stringify(state, null, 2))

      for (const [stakingContract, details] of Object.entries(epoch.detailsByStakingContract)) {
        for (const stakingAddress of Object.keys(details.distributionsByStakingAddress)) {
          epoch.detailsByStakingContract[stakingContract].distributionsByStakingAddress[stakingAddress].txId =
            executionTxId
        }
      }

      spinner.succeed('Distribution complete')

      info(`View Transaction: ${chalk.blue(`https://arbiscan.io/tx/${executionTxId}`)}`)

      return epoch
    } catch (err) {
      spinner.fail(`Distribution failed: ${err}`)
      process.exit(1)
    }
  }

  private async createSafeTransaction(distributions: RewardDistribution[], spinner: Ora): Promise<SafeTransaction> {
    try {
      spinner.start('Creating safe transaction...')

      const transactions = distributions
        .filter(distribution => BigNumber(distribution.amount).gt(0))
        .map(
          (distribution): MetaTransactionData => ({
            to: ARBITRUM_USDC_ADDRESS,
            value: '0',
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [distribution.rewardAddress, BigInt(distribution.amount)],
            }),
            operation: OperationType.Call,
          }),
        )

      const safeTransaction = await this.safe.createTransaction({ transactions })

      spinner.succeed('Safe transaction created')

      return safeTransaction
    } catch (err) {
      spinner?.fail(`Failed to create Safe transaction: ${err}`)
      process.exit(1)
    }
  }

  private async sendTransaction(safeTransaction: SafeTransaction, spinner: Ora): Promise<string> {
    spinner.start('Connecting with WalletConnect...')

    const client = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      logger: pino({ level: 'error' }),
      metadata: {
        name: 'rFOX CLI',
        description: 'rFOX Reward Distribution',
        url: 'https://github.com/shapeshift/rFOX',
        icons: ['https://app.safe.global/favicon.ico'],
      },
    })

    const { uri, approval } = await client.connect({
      optionalNamespaces: {
        eip155: {
          methods: ['eth_sendTransaction'],
          chains: [ARBITRUM_CHAIN_ID],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
    })

    if (!uri) {
      spinner.fail('Failed to create WalletConnect URI')
      process.exit(1)
    }

    spinner.info(chalk.dim.white(`Connect your wallet: ${chalk.blue(uri)}`))
    spinner.start('Waiting for wallet connection...')

    const session = await approval()

    spinner.succeed('Connected to WalletConnect')

    const connectedAddress = session.namespaces.eip155.accounts[0]?.split(':')[2]

    spinner.start('Sending transaction to Safe...')

    const txId = await client.request({
      chainId: ARBITRUM_CHAIN_ID,
      topic: session.topic,
      request: {
        method: 'eth_sendTransaction',
        params: [
          {
            from: connectedAddress,
            to: safeTransaction.data.to,
            data: safeTransaction.data.data,
            value: safeTransaction.data.value,
            operation: safeTransaction.data.operation,
          },
        ],
      },
    })

    spinner.succeed('Transaction sent to Safe')

    return txId as string
  }

  private async pollForExecution(safeTxId: string, spinner: Ora): Promise<string> {
    while (true) {
      try {
        const tx = await this.api.getTransaction(safeTxId)
        if (tx.transactionHash) return tx.transactionHash
        spinner.text = `Waiting for transaction execution... (${tx.confirmations?.length ?? 0}/${tx.confirmationsRequired} confirmations)`
      } catch (err) {
        spinner.warn(`Error polling transaction status: ${err}`)
      }

      await new Promise(resolve => setTimeout(resolve, 15_000))
    }
  }
}
