import { AbiEvent, Address, Log, parseEventLogs } from 'viem'

type StakingEventName = 'Stake' | 'Unstake'

type StakingAbiEvent<T extends StakingEventName> = {
  type: 'event',
  anonymous: false,
  inputs: [
    {
      name: 'account',
      type: 'address',
      indexed: true
    },
    {
      name: 'amount',
      type: 'uint256',
      indexed: false
    }
    // TOOD(gomes): if runeAddress is part of the staking fn, then it should be part of the Stake event too and should be reflected here
  ],
  name: T
}

type GenericStakingEventLog<T extends StakingEventName> = Log<bigint, number, false, AbiEvent, true, StakingAbiEvent<T>[], T>

// explicit union of all possible event logs to ensure event args are correctly parsed by ts (fixes defaulting to unknown)
export type StakingEventLog = GenericStakingEventLog<'Stake'> | GenericStakingEventLog<'Unstake'>

const addressA: Address = '0xA'
const addressB: Address = '0xB'
const addressC: Address = '0xC'
const addressD: Address = '0xD'
const addressE: Address = '0xE'

export type StakingLog = Pick<StakingEventLog, 'blockNumber'|'eventName'|'args'>

export const logs: StakingLog[] = [
  { blockNumber: 20n, eventName: 'Stake', args: { account: addressA, amount: 100n } },
  { blockNumber: 25n, eventName: 'Stake', args: { account: addressB, amount: 150n } },
  { blockNumber: 32n, eventName: 'Stake', args: { account: addressC, amount: 10000n } },
  { blockNumber: 33n, eventName: 'Stake', args: { account: addressD, amount: 1200n } },
  { blockNumber: 60n, eventName: 'Unstake', args: { account: addressA, amount: 100n } },
  { blockNumber: 65n, eventName: 'Stake', args: { account: addressE, amount: 500n } },
]
