import { defineConfig } from "@wagmi/cli";
import { type FoundryConfig } from "@wagmi/cli/plugins";
import { foundry } from "@wagmi/cli/plugins";

const foundryConfig: FoundryConfig = {
  project: "../../foundry",
  artifacts: "out/",
  // We need to explicitly whitelist the contracts we want, else we get duplicate contract names from the Foundry contracts
  include: ["FoxStakingV1.sol/**", "StakingInfo.sol/**"],
};

export default defineConfig({
  out: "src/generated.ts",
  contracts: [],
  plugins: [foundry(foundryConfig)],
});
