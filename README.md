# rFOX

## Getting started

- Make sure you have the Foundry toolkit installed: https://book.getfoundry.sh/getting-started/installation

## Smart contract development

- `cd foundry`
- Build the smart contracts, artifacts and typings with `yarn build-and-generate`
- Run tests with `forge test`

## CLI dev

- Run foundry's anvil with `anvil`
- Rewards distribution can be tested locally with `ts-node scripts/rewards-distribution/index.ts`
- Ensure you CTRL + C anvil and restart it between run to clear your local blockchain state.
