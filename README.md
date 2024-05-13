# rFOX

## Deployments

### Arbitrum One

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
- Ensure you CTRL + C anvil and restart it between run to clear your local blockchain state.
