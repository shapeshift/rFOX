#!/bin/bash

set -ex

forge clean --root foundry

# Default private keys from anvil, assuming the default mnemonic
# "test test test test test test test test test test test junk"
export OWNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export USER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export ARBITRUM_JSON_RPC_URL="http://127.0.0.1:8545"

# Deploy the mock FOX token as the staking token
stakingTokenDeployOutput=$(
  forge script foundry/script/DeployMockFoxToken.s.sol:DeployMockFoxToken \
    --root foundry \
    --broadcast \
    --rpc-url http://127.0.0.1:8545 \
    --private-key $OWNER_PRIVATE_KEY \
    -vvv
)
stakingTokenAddress=$(echo "$stakingTokenDeployOutput" | grep "Contract deployed at:" | awk '{print $4}')
export STAKING_TOKEN_ADDRESS=$stakingTokenAddress

# Deploy the staking proxy
stakingProxyDeployOutput=$(
  forge script foundry/script/DeployStaking.s.sol:DeployStaking \
    --root foundry \
    --broadcast \
    --rpc-url http://127.0.0.1:8545 \
    --private-key $OWNER_PRIVATE_KEY \
    -vvv
)
stakingProxyAddress=$(echo "$stakingProxyDeployOutput" | grep "Contract deployed at:" | awk '{print $4}')
export STAKING_PROXY_ADDRESS=$stakingProxyAddress

# Run the rewards distribution simulation
ts-node scripts/rewards-distribution/index.ts
