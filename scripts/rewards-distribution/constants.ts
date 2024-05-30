import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localhost } from "viem/chains";

export const localChain = {
  ...localhost,
  id: 31337,
} as const;

export const localOwnerWalletClient = createWalletClient({
  chain: localChain,
  account: privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`),
  transport: http(process.env.ANVIL_JSON_RPC_URL),
});

export const localUserWalletClient = createWalletClient({
  chain: localChain,
  account: privateKeyToAccount(process.env.USER_PRIVATE_KEY as `0x${string}`),
  transport: http(process.env.ANVIL_JSON_RPC_URL),
});

export const localPublicClient = createPublicClient({
  chain: localChain,
  transport: http(process.env.ANVIL_JSON_RPC_URL),
});
