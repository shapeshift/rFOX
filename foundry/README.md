# rFOX

## Setup

1. Install foundry https://book.getfoundry.sh/getting-started/installation
2. Install slither `brew install slither-analyzer`

### Private key

To derive a private key 0 from your mnemonic:

```shell
cast wallet derive-private-key $MNEMONIC 0
```

### Faucets

**Arbitrum sepolia**

Grab some ETH:
https://www.l2faucet.com/arbitrum

Grab some USDC:
https://faucet.circle.com/

## Deploying

```shell
cd foundry

# [local only] Start a local fork
make anvil

# Instal and deploy
make install
make deploy-arbitrum-sepolia

# Test the contract deployed
cast call $ARBITRUM_SEPOLIA_PROXY_ADDRESS "version()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

### Manually verifying

If contract verification fails for any reason, you can verify without re-deploying:

```shell
forge verify-contract \
  --verifier etherscan \
  --verifier-url https://api-sepolia.arbiscan.io/api \
  --compiler-version "v0.8.25" \
  --etherscan-api-key $ARBISCAN_API_KEY \
  $ARBITRUM_SEPOLIA_CONTRACT_IMPLEMENTATION_ADDRESS \
  src/FoxStakingV1.sol:FoxStakingV1
```
