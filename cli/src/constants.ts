import type { Address } from 'viem'

export const ETHEREUM_SAFE_ADDRESS: Address = '0x90A48D5CF7343B08dA12E067680B4C6dbfE551Be'
export const ETHEREUM_USDC_ADDRESS: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

// The ethereum rFOX program has a boosted distribution rate for the October, November and December 2026 epochs
export const ETHEREUM_RFOX_BOOSTED_DISTRIBUTION_RATE = 0.5
export const ETHEREUM_RFOX_BOOSTED_DISTRIBUTION_END_TIMESTAMP = Date.UTC(2027, 0, 1)

export const ETHEREUM_RFOX_DISTRIBUTION_RATE = 0.25
export const ETHEREUM_RFOX_PROXY_CONTRACT_ADDRESS_FOX: Address = '0x7AC9c77263473A9e1DC9621F97b886c1e90Ddd33'
export const ETHEREUM_RFOX_PROXY_CONTRACT_DEPLOYMENT_BLOCK = 25906046n

export const RFOX_REWARD_RATE = 1n * 10n ** 27n

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
