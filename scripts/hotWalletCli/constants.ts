import os from 'node:os'
import path from 'node:path'

export const RFOX_DIR = path.join(os.homedir(), 'rfox')
export const RFOX_REWARD_RATE = 1n * 10n ** 27n
export const RFOX_WAD = 1n * 10n ** 18n

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
