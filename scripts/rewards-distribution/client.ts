import assert from "assert";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";

// TODO: dotenv or similar
assert(process.env.ARBITRUM_JSON_RPC_URL, "ARBITRUM_JSON_RPC_URL is required");

export const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.ARBITRUM_JSON_RPC_URL),
});
