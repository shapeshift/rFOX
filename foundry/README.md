# rFOX

## Setup

1. Install foundry https://book.getfoundry.sh/getting-started/installation
2. Install slither `brew install slither-analyzer`
3. Set up .env files:
    1. Copy an example .env file for your chosen environment:
        ```shell
        cp .env.<your-chosen-env>.example .env.<your-chosen-env>
        ```
    2. Fill in the needed env vars there

### Private key

To derive a private key 0 from your mnemonic:

```shell
cast wallet derive-private-key <YOUR_MNEMONIC> 0
```

### Faucets

**Arbitrum sepolia**

Grab some ETH:
https://www.l2faucet.com/arbitrum

Grab some USDC:
https://faucet.circle.com/

## Deploying

### Local deployment
Deploying locally is different to deploying directly to a network for 2 reasons:
1. Its being deployed to a fork of another network (typically ethereum mainnet) rather than a real network.
2. There's no local instance of etherscan, so etherscan verification is skipped.

When deploying locally, it's necessary to start a local fork before deploying:

```shell
# RPC_URL for your env can be accessible with `source .env.<your-chosen-env`.
anvil --rpc-url $RPC_URL
```

### Deployment steps

```shell
cd foundry 

# Install
forge install

# Deploy
./deploy.sh --env <your-chosen-env>

# Test the proxy contract has been deployed with the correct version.
# RPC_URL for your env can be accessible with `source .env.<your-chosen-env`.
cast call <CONTRACT_PROXY_ADDRESS> "version()(uint256)" --rpc-url $RPC_URL
```

### Manually verifying

If contract verification fails for any reason, you can verify without re-deploying:

```shell
forge verify-contract \
  --verifier etherscan \
  --verifier-url https://api-sepolia.arbiscan.io/api \
  --compiler-version "v0.8.25" \
  --etherscan-api-key $ARBISCAN_API_KEY \
  $CONTRACT_IMPLEMENTATION_ADDRESS \
  src/FoxStakingV1.sol:FoxStakingV1
```
