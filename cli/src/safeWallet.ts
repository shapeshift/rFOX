import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import type { MetaTransactionData, SafeTransaction } from '@safe-global/types-kit'
import { OperationType } from '@safe-global/types-kit'
import BigNumber from 'bignumber.js'
import chalk from 'chalk'
import path from 'node:path'
import ora, { type Ora } from 'ora'
import { concat, encodeAbiParameters, encodeFunctionData, erc20Abi, parseAbi, size } from 'viem'
import type { Hex } from 'viem'
import { arbitrum } from 'viem/chains'
import {
  ARBITRUM_MULTISEND_ADDRESS,
  ARBITRUM_SAFE_ADDRESS,
  ARBITRUM_USDC_ADDRESS,
  UNCHAINED_ARBITRUM_URL,
} from './constants'
import { read, write } from './file'
import { RFOX_DIR } from './index'
import { error, info, warn } from './logging'
import type { Epoch, RewardDistribution } from './types'

const SAFE_API_KEY = process.env['SAFE_API_KEY']

if (!SAFE_API_KEY) {
  error('SAFE_API_KEY not set. Please make sure you copied the sample.env and filled out your .env file.')
  process.exit(1)
}

type SafeTransactionState = {
  safeTxHash: string
  executionTxHash: string
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
    const spinner = ora('Processing distribution...').start()

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
        const safeTxHash = await this.proposeTransaction(safeTransaction, spinner)

        state = {
          safeTxHash,
          executionTxHash: '',
        }

        write(stateFile, JSON.stringify(state, null, 2))
      }

      const safeUILink = `https://app.safe.global/transactions/tx?safe=arb1:${ARBITRUM_SAFE_ADDRESS}&id=multisig_${ARBITRUM_SAFE_ADDRESS}_${state.safeTxHash}`
      info(`View in Safe UI: ${chalk.blue(safeUILink)}`)

      const executionTxHash = await this.pollForExecution(state.safeTxHash, spinner)
      state.executionTxHash = executionTxHash

      write(stateFile, JSON.stringify(state, null, 2))

      for (const [stakingContract, details] of Object.entries(epoch.detailsByStakingContract)) {
        for (const stakingAddress of Object.keys(details.distributionsByStakingAddress)) {
          epoch.detailsByStakingContract[stakingContract].distributionsByStakingAddress[stakingAddress].txId =
            executionTxHash
        }
      }

      spinner.succeed(`Distribution complete`)

      info(`View Transaction: ${chalk.blue(`https://arbiscan.io/tx/${executionTxHash}`)}`)

      return epoch
    } catch (err) {
      spinner.fail(`Distribution failed: ${err}`)
      process.exit(1)
    }
  }

  private async createSafeTransaction(distributions: RewardDistribution[], spinner: Ora): Promise<SafeTransaction> {
    try {
      spinner.text = 'Creating safe transaction...'

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

      const encodedTransactions = transactions.map(tx => {
        return encodeAbiParameters(
          [
            { type: 'uint8', name: 'operation' },
            { type: 'address', name: 'to' },
            { type: 'uint256', name: 'value' },
            { type: 'uint256', name: 'dataLength' },
            { type: 'bytes', name: 'data' },
          ],
          [tx.operation!, tx.to, BigInt(tx.value), BigInt(size(tx.data as Hex)), tx.data! as Hex],
        )
      })

      const safeTransaction = await this.safe.createTransaction({
        transactions: [
          {
            to: ARBITRUM_MULTISEND_ADDRESS,
            value: '0',
            data: encodeFunctionData({
              abi: parseAbi(['function multiSend(bytes transactions)']),
              functionName: 'multiSend',
              args: [concat(encodedTransactions)],
            }),
            operation: OperationType.DelegateCall,
          },
        ],
      })

      spinner.text = 'Safe transaction created'

      return safeTransaction
    } catch (err) {
      spinner?.fail(`Failed to create Safe transaction: ${err}`)
      process.exit(1)
    }
  }

  private async proposeTransaction(safeTransaction: SafeTransaction, spinner: Ora): Promise<string> {
    try {
      spinner.text = 'Proposing Safe transaction...'

      const safeTxHash = await this.safe.getTransactionHash(safeTransaction)
      const senderAddress = (await this.safe.getOwners())[0]

      await this.api.proposeTransaction({
        safeAddress: ARBITRUM_SAFE_ADDRESS,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress,
        senderSignature: '0x',
      })

      return safeTxHash
    } catch (err) {
      spinner?.fail(`Failed to propose Safe transaction: ${err}`)
      process.exit(1)
    }
  }

  private async pollForExecution(safeTxHash: string, spinner: Ora): Promise<string> {
    while (true) {
      try {
        const tx = await this.api.getTransaction(safeTxHash)
        if (tx.transactionHash) return tx.transactionHash
        spinner.text = `Waiting for execution... (${tx.confirmations?.length ?? 0}/${tx.confirmationsRequired} confirmations)`
      } catch (err) {
        warn(`Error polling transaction status: ${err}`)
      }

      await new Promise(resolve => setTimeout(resolve, 15_000))
    }
  }
}
