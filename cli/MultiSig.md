## Prerequisites

- Install golang (v1.22): https://go.dev/doc/install
- Create common rfox directory in your home directory. This is where all output files from the script will be stored and where shared files (unsigned transactions, signatures, signed transactions, etc.) should be saved.
  ```bash
  mkdir ~/rfox
  ```

## Clone and Build

```bash
git clone https://gitlab.com/thorchain/thornode.git
cd thornode
git checkout develop
git pull
cd cmd/thornode
go build --tags cgo,ledger
```

## Create MultiSig

- Add your key:
  ```bash
  ./thornode keys add {person1} --ledger
  ```
- Export pubkey:
  ```bash
  ./thornode keys show {person1} --pubkey
  ```
- Import signer pubkeys:
  ```bash
  ./thornode keys add {person2} --pubkey '{person2_pubkey}'
  ./thornode keys add {person3} --pubkey '{person3_pubkey}'
  ```
- View keys:
  ```bash
  ./thornode keys list
  ```
- Add multisig key:
  ```bash
  ./thornode keys add multisig --multisig {person1},{person2},{person3} --multisig-threshold 2
  ```
- Validate multisig address:
  ```bash
  ./thornode keys show multisig --address
  ```

## Sign Transaction

- Person 1 signs:
  ```bash
  ./thornode tx sign --from {person1} --multisig multisig ~/rfox/unsignedTx_epoch-{N}.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --ledger --sign-mode amino-json > ~/rfox/signedTx_epoch-{N}_{person1}.json
  ```
- Person 2 signs:
  ```bash
  ./thornode tx sign --from {person2} --multisig multisig ~/rfox/unsignedTx_epoch-{N}.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --ledger --sign-mode amino-json > ~/rfox/signedTx_epoch-{N}_{person2}.json
  ```
- Multisign:
  ```bash
  ./thornode tx multisign ~/rfox/unsignedTx_epoch-{N}.json multisig ~/rfox/signedTx_epoch-{N}_{person1}.json ~/rfox/signedTx_epoch-{N}_{person2}.json --from multisig --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc > ~/rfox/signedTx_epoch-{N}_multisig.json
  ```

## Send Transaction

- Simulate transaction:

  ```bash
  ./thornode tx broadcast ~/rfox/signedTx_epoch-{N}_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --dry-run > ~/rfox/simulatedTx_epoch-{N}.json
  ```

  - Validate contents of `simulatedTx.json` for accuracy before broadcasting

- Broadcast transaction:
  ```bash
  ./thornode tx broadcast ~/rfox/signedTx_epoch-{N}_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --gas auto > tx.json
  ```

At this point, the cli should pick up the funding transaction and continue running the distribution from the hot wallet.
