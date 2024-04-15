# rFOX

## Setup

1. Install foundry https://book.getfoundry.sh/getting-started/installation
2. Install slither `brew install slither-analyzer`

## Deploying

```shell
cd foundry

# Start a local fork
make anvil

# Deploy to the local fork
make install
make clean
make deploy-local

# Test the contract deployed
cast call $CONTRACT_ADDRESS "version()(uint256)" --rpc-url $LOCAL_RPC_URL
```
