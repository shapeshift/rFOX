import { createPublicClient, createWalletClient, http } from "viem";
import { localhost } from "viem/chains";

const ANVIL_JSON_RPC_URL = 'http://localhost:8545'

export const localChain = {
  ...localhost,
  id: 31337
} as const

export const localWalletClient = createWalletClient({
  chain: localChain,
  transport: http(ANVIL_JSON_RPC_URL)
});

export const localPublicClient = createPublicClient({
  chain: localChain,
  transport: http(ANVIL_JSON_RPC_URL)
});
