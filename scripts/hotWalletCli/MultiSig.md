## Prerequisites

- Install golang: https://go.dev/doc/install

## Clone and Build

```bash
git clone https://gitlab.com/thorchain/thornode.git
cd thornode/cmd/thornode
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
  ./thornode keys add {person2} --pubkey {pubkey}
  ./thornode keys add {person3} --pubkey {pubkey}
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
  ./thornode tx sign --from {person1} --multisig multisig {unsignedTx_epoch-N.json} --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --from ledger --ledger --sign-mode amino-json > signedTx_{person1}.json
  ```
- Person 2 signs:
  ```bash
  ./thornode tx sign --from {person2} --multisig multisig {unsignedTx_epoch-N.json} --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --from ledger --ledger --sign-mode amino-json > signedTx_{person2}.json
  ```
- Multisign:
  ```bash
  ./thornode tx multisign {unsignedTx_epoch-N.json} multisig signedTx_{person1}.json signedTx_{person2}.json --from multisig --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc > signedTx_multisig.json
  ```

## Send Transaction

- Simulate transaction:

  ```bash
  ./thornode tx broadcast signedTx_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --gas auto --dry-run > simulatedTx.json
  ```

  - Validate contents of `simulatedTx.json` for accuracy before broadcasting

- Broadcast transaction:
  ```bash
  ./thornode tx broadcast signedTx_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --gas auto > tx.json
  ```
  - Copy the `txhash` value from `tx.json` to supply to the cli in order to continue
