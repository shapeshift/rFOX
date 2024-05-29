import { Address } from "viem";

export const RUNE_DECIMALS = 8;

export const WAD = 1n * 10n ** 18n;
export const REWARD_RATE = 1_000_000_000n;

// The number of blocks to query at a time, when fetching logs
export const GET_LOGS_BLOCK_STEP_SIZE = 20000n;

// RFOX on Arbitrum ERC1967Proxy contract address
export const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS: Address =
  "0xd612B64A134f3D4830542B7463CE8ca8a29D7268";
