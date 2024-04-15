-include .env

.PHONY: all test clean help install anvil

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all       								- Build the project"
	@echo "  test      								- Run the tests"
	@echo "  clean     								- Clean the project"
	@echo "  deploy-mainnet    				- Deploy the contracts to local testnet"
	@echo "  deploy-mainnet    				- Deploy the contracts to ethereum mainnet"
	@echo "  deploy-sepolia    				- Deploy the contracts to ethereum sepolia testnet"
	@echo "  deploy-arbitrum-one     	- Deploy the contracts to arbitrum one"
	@echo "  deploy-arbitrum-sepolia 	- Deploy the contracts to arbitrum sepolia testnet"
	@echo "  help      								- Show this help message"
	@echo "  install   								- Install the project dependencies"
	@echo "  anvil    								- Start the Anvil server"

all: clean install build

clean :; forge clean

install :; forge install

build :; forge build

format :; forge fmt

anvil :; anvil --fork-url $(MAINNET_RPC_URL)

.PHONY: deploy-local deploy-mainnet deploy-sepolia deploy-arbitrum-one deploy-arbitrum-sepolia

_deploy:
	forge script script/DeployFoxStaking.s.sol:DeployFoxStaking --broadcast -vvvvv $(NETWORK_ARGS)

# Deploy the contract to local fork of mainnet.
# Be sure to have a local fork of mainnet running via `make anvil`.
deploy-local: export FOX_TOKEN_ADDRESS=$(MAINNET_FOX_TOKEN_ADDRESS)
deploy-local: export NETWORK_ARGS=--fork-url $(LOCAL_RPC_URL)  --private-key $(LOCAL_PRIVATE_KEY)
deploy-local:
	${MAKE} _deploy

# TODO: rewrite following local firk example above
# deploy-mainnet:
# 	FOX_TOKEN_ADDRESS := $(MAINNET_FOX_TOKEN_ADDRESS)
# 	NETWORK_ARGS := --rpc-url $(MAINNET_RPC_URL)  --private-key $(ETHEREUM_PRIVATE_KEY) --verify
# 	${MAKE} _deploy

# deploy-sepolia:
# 	FOX_TOKEN_ADDRESS := $(SEPOLIA_FOX_TOKEN_ADDRESS)
# 	NETWORK_ARGS := --rpc-url $(SEPOLIA_RPC_URL)  --private-key $(ETHEREUM_PRIVATE_KEY) --verify
# 	${MAKE} _deploy

# deploy-arbitrum-one:
# 	FOX_TOKEN_ADDRESS := $(ARBITRUM_ONE_FOX_TOKEN_ADDRESS)
# 	NETWORK_ARGS := --rpc-url $(ARBITRUM_ONE_RPC_URL)  --private-key $(ARBITRUM_PRIVATE_KEY) --verify
# 	${MAKE} _deploy

# deploy-arbitrum-sepolia:
# 	FOX_TOKEN_ADDRESS := $(ARBITRUM_SEPOLIA_FOX_TOKEN_ADDRESS)
# 	NETWORK_ARGS := --rpc-url $(ARBITRUM_SEPOLIA_RPC_URL)  --private-key $(ARBITRUM_PRIVATE_KEY) --verify
# 	${MAKE} _deploy
