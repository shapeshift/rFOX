# rFOX

## Deployments

### Arbitrum One - Alpha deployments for testing only - DO NOT USE

- ERC1967Proxy: `0x0c66f315542fdec1d312c415b14eef614b0910ef`
- FoxStakingV1.sol: `0x06875e37e780a5aed7e57dc648d5ae7c455fbb55`

## Getting started

- Make sure you have the Foundry toolkit installed: https://book.getfoundry.sh/getting-started/installation

## Smart contract development

- `cd foundry`
- Build the smart contracts, artifacts and typings with `yarn build`
- Run tests with `forge test`

## CLI dev

- Run foundry's anvil with `anvil`
- Rewards distribution can be tested locally with `ts-node scripts/rewards-distribution/index.ts`
- Rewards distribution script can be debugged locally with `cd scripts/rewards-distribution` and `NODE_OPTIONS="-r ts-node/register" node --inspect-brk index.ts` then going to `chrome://inspect` in Chrome to open the Node.JS debugging tools
- Ensure you CTRL + C anvil and restart it between run to clear your local blockchain state

# rFOX.wtf

rFOX is a novel staking mechanism ratified by FOX token holders in [SCP-166](https://snapshot.org/#/shapeshiftdao.eth/proposal/0x0bb84bdf838fb90da922ce62293336bf7c0c67a9a1d6fe451ffaa29284722f9f). Currently, the proposal is limited to single sided FOX staking but community members are expected to propose additional approval for FOX<>ETH Liquidity Tokens as well. The contracts expect that any token
will be fully ERC20 compliant and not a rebasing or fee on transfer type token. Stakers in contract lock their `stakingToken` and designate a Thorchain Rune address to associate with their staked balance. Each epoch, as designated in SCP-166, stakers then receive a percentage of the Shapeshift DAO's total RUNE that is accumulated through affiliate fees during that epoch. The distribution of these rewards is handled off chain by the DAO multisig and is not part of the rFOX contract. The rFOX contract is responsible for tracking the staked balances and an arbitrary unit of rewards that are due to each staker. These reward units (similar to points) allow for an easy way to calculate each participants starting balance and ending balance for each epoch. The delta between these two values represents the accumulated rewards for a user
in a given epoch, and a multiplier can be applied to then translate that into a RUNE amount for off chain distribution.

When a user chooses to unstake, they immediately stop earning rewards and enter into a cool-down period. Initially this is set at 28 days, but the contracts are intended allow for this to change. Users can choose to unstake any amount of their fully staked balance and the contract also supports multiple concurrent unstakes (potentially with differing cool down periods). After the cool down period has ended, the user
is able to claim back their stakingToken.

The owner of these contracts will be the Shapeshift DAO multisig and the contracts are intended to be upgradeable as determined by the DAO. Similarly, the owner has the ability to pause various features in the contract as a safeguard in the case something goes wrong.

Their is no ability to verify that the RUNE address supplied by the user is correct on the EVM blockchain, we have added a basic length check and additional verification will be added into the UI to ensure that the user has entered a valid address. Users do have the ability to update this address as they please, however we plan to snapshot the rune address that is set at the end of each epoch for reward distribution purposes.

#### Audit area of focus

1. Any ability for a user to remove funds from the contract that aren't theirs or are theirs but doesn't follow the typical unstaking flow and cool-down
2. Any ability for a user to game the system and earn more rewards than they should
3. Any escalation of owner privileges beyond what is explicitly defined (upgrading, pausing, etc)
4. Overflow or precision issues that could cause the onchain accounting of rewards to be incorrect (beyond dust), revert, or otherwise be exploitable
5. Any ability for the manipulation of a RUNE address by another user.
