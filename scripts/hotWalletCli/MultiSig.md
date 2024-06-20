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
  ./thornode tx sign --from {person1} --multisig multisig {unsigned_tx.json} --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --from ledger --ledger --sign-mode amino-json > tx_signed_{person1}.json
  ```
- Person 2 signs:
  ```bash
  ./thornode tx sign --from {person2} --multisig multisig {unsigned_tx.json} --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --from ledger --ledger --sign-mode amino-json > tx_signed_{person2}.json
  ```
- Multisign:
  ```bash
  ./thornode tx multisign {unsigned_tx.json} multisig tx_signed_{person1}.json tx_signed_{person2}.json --from multisig --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc > tx_signed_multisig.json
  ```

## Send Transaction

- Simulate transaction:

  ```bash
  ./thornode tx broadcast tx_signed_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --gas auto --dry-run > simulated_tx.json
  ```

  - Validate contents of `simulated_tx.json` for accuracy before broadcasting

- Broadcast transaction:
  ```bash
  ./thornode tx broadcast tx_signed_multisig.json --chain-id thorchain-mainnet-v1 --node https://daemon.thorchain.shapeshift.com:443/rpc --gas auto > tx.json
  ```
  - Copy the `txhash` value from `tx.json` to supply to the cli in order to continue
