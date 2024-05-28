import { Address } from "viem";

export const RUNE_DECIMALS = 8;

// The number of blocks to query at a time, when fetching logs
export const GET_LOGS_BLOCK_STEP_SIZE = 20000n;

// RFOX on Arbitrum ERC1967Proxy contract address
export const ARBITRUM_RFOX_PROXY_CONTRACT_ADDRESS: Address =
  "0x0c66f315542fdec1d312c415b14eef614b0910ef";
