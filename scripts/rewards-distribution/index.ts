import { Address } from 'viem'
import { StakingLog, logs } from './events'
import { assertUnreachable } from './helpers'

const getStakingAmount = (log: StakingLog): bigint => {
  switch (log.eventName) {
    case 'Stake':
      return log.args.amount
    case 'Unstake':
      return -log.args.amount
    default:
      assertUnreachable(log.eventName)
  }

  throw Error('should be unreachable')
}

// get the epoch and block reward for a given block number
// TODO: this is a placeholder function matching the spreadsheet logic
const getEpochBlockReward = (_epochEndBlockNumber: bigint) => {
  // TODO: blockReward is calculated as half the total rune earned by the DAO divided by the number of blocks in the epoch
  return 10n
}

// get the block range for the current epoch
const getEpochBlockRange = () => {
  const previousEpochEndBlockNumber = 0n
  const currentBlockNumber = 100n
  return { fromBlockNumber: previousEpochEndBlockNumber, toBlockNumber: currentBlockNumber }
}

// TODO: this should only process 1 epoch at a time
const main = () => {
  // index logs by block number
  const logsByBlockNumber = logs.reduce<Record<string, StakingLog[]>>((acc, log) => {
    if (!acc[log.blockNumber.toString()]) {
      acc[log.blockNumber.toString()] = []
    }
    acc[log.blockNumber.toString()].push(log)
    return acc
  }, {})

  // TODO: these will be initialized from the last epoch's state
  let totalStaked = 0n
  const balanceByAccount: Record<Address, bigint> = {}

  // this must be initialized to empty
  const epochRewardByAccount: Record<Address, number> = {}

  // iterate all blocks for the current epoch
  const { fromBlockNumber, toBlockNumber } = getEpochBlockRange()

  const epochBlockReward = getEpochBlockReward(toBlockNumber)

  for (let blockNumber = fromBlockNumber; blockNumber <= toBlockNumber; blockNumber++) {
    const incomingLogs: StakingLog[] | undefined = logsByBlockNumber[blockNumber.toString()]

    // process logs if there are any
    if (incomingLogs !== undefined) {
      for (const log of incomingLogs) {
        const account = log.args.account
        if (!balanceByAccount[account]) {
          balanceByAccount[account] = 0n
        }
        const stakingAmount = getStakingAmount(log)
        balanceByAccount[account] += stakingAmount
        totalStaked += stakingAmount

        // clear empty balances
        if (balanceByAccount[account] === 0n) {
          delete balanceByAccount[account]
        }
      }
    }

    for (const account of Object.keys(balanceByAccount) as Address[]) {
      // calculate rewards for the current block
      // TODO: Bignumber math should be used here to allow for more precision with floating point numbers
      const proportionOfTotalStaked = totalStaked > 0n ? Number(balanceByAccount[account]) / Number(totalStaked) : 0
      const reward = Number(epochBlockReward) * proportionOfTotalStaked

      if (epochRewardByAccount[account] == undefined) {
        epochRewardByAccount[account] = 0
      }
      epochRewardByAccount[account] += reward
    }
  }

  console.log('rewards to be distributed:')
  console.log(epochRewardByAccount)
}

main()
