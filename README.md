# rFOX

## About

Please check out the [wiki](https://github.com/shapeshift/rFOX/wiki/rFOX) for more information on rFOX, deployment addresses and audits

## Development

### Getting started

- Make sure you have the Foundry toolkit installed: https://book.getfoundry.sh/getting-started/installation

### Smart contract development

- `cd foundry`
- Build the smart contracts, artifacts and typings with `yarn build`
- Run tests with `forge test`

### CLI dev

- Run foundry's anvil with `anvil`
- Rewards distribution can be tested locally with `ts-node scripts/rewards-distribution/index.ts`
- Rewards distribution script can be debugged locally with `cd scripts/rewards-distribution` and `NODE_OPTIONS="-r ts-node/register" node --inspect-brk index.ts` then going to `chrome://inspect` in Chrome to open the Node.JS debugging tools
- Ensure you CTRL + C anvil and restart it between run to clear your local blockchain state
