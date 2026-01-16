import { input } from '@inquirer/prompts'
import BigNumber from 'bignumber.js'
import chalk from 'chalk'
import path from 'node:path'
import { isHash } from 'viem'
import { ARBITRUM_SAFE_ADDRESS, ARBITRUM_USDC_ADDRESS } from './constants'
import { read, write } from './file'
import { RFOX_DIR } from './index'
import { info } from './logging'
import type { Epoch } from './types'

export class SafeWallet {
  static async new(): Promise<SafeWallet> {
    return new SafeWallet()
  }

  async distribute(epoch: Epoch): Promise<Epoch> {
    const distributions = Object.values(epoch.detailsByStakingContract)
      .flatMap(details => Object.values(details.distributionsByStakingAddress))
      .filter(distribution => BigNumber(distribution.amount).gt(0))

    const csvFile = path.join(RFOX_DIR, `airdrop_epoch-${epoch.number}.csv`)
    const csvData = read(csvFile)

    if (!csvData) {
      const header = 'token_type,token_address,receiver,amount,id'
      const rows = distributions.map((distribution, index) => {
        const usdcAmount = BigNumber(distribution.amount).div(1e6).toString()
        return `erc20,${ARBITRUM_USDC_ADDRESS},${distribution.rewardAddress},${usdcAmount},${index}`
      })

      const csv = [header, ...rows].join('\n')
      write(csvFile, csv)
    }

    const csvAirdropSafeApp = `https://app.safe.global/apps/open?safe=arb1:${ARBITRUM_SAFE_ADDRESS}&appUrl=https://schmanu.infura-ipfs.io/ipfs/QmTNXEN4f4r9XnFk5QUmsMz1JjvvvGp2Eudv3Y5N5qRWEv`
    info(`Upload ${chalk.blue(csvFile)} to Safe App: ${chalk.blue(csvAirdropSafeApp)}`)

    const executionTxId = await input({
      message: 'Enter the transaction id after executing the transaction:',
      validate: (value: string) => {
        if (!isHash(value)) return 'Please enter a valid transaction id'
        return true
      },
    })

    for (const [stakingContract, details] of Object.entries(epoch.detailsByStakingContract)) {
      for (const stakingAddress of Object.keys(details.distributionsByStakingAddress)) {
        epoch.detailsByStakingContract[stakingContract].distributionsByStakingAddress[stakingAddress].txId =
          executionTxId
      }
    }

    info(`View Transaction: ${chalk.blue(`https://arbiscan.io/tx/${executionTxId}`)}`)

    return epoch
  }
}
