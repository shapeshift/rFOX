export type Distribution = {
  epoch: number
  rewards: {
    address: string
    value: string
    stakingAddress: string
  }[]
}
