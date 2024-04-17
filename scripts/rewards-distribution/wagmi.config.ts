import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";
import { type FoundryConfig } from "@wagmi/cli/plugins";
import FoxStaking from "../../foundry/out/FoxStakingV1.sol/FOXStakingV1.json";

const foundryConfig: FoundryConfig = {
  project: "../../foundry",
  artifacts: "out/",
  include: ["FoxStakingV1.sol/**", "StakingInfo.sol/**"],
  // exclude: [
  //   'IERC721.sol/**',
  // ]
};

export default defineConfig({
  out: "src/generated.ts",
  contracts: [],
  plugins: [foundry(foundryConfig)],
});
