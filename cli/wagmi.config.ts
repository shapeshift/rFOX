import { defineConfig } from '@wagmi/cli'
import { foundry, FoundryConfig } from '@wagmi/cli/plugins'

const foundryConfig: FoundryConfig = {
  project: '../foundry',
  artifacts: 'out',
  include: ['StakingV1.json'],
}

export default defineConfig({
  out: 'generated/abi.ts',
  contracts: [],
  plugins: [foundry(foundryConfig)],
})
