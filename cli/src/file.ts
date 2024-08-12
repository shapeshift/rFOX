import fs from 'node:fs'
import { error, info, warn } from './logging'
import { RFOX_DIR } from '.'

const deleteIfExists = (file: string) => {
  try {
    fs.accessSync(file, fs.constants.F_OK)
    fs.unlinkSync(file)
  } catch {}
}

export const write = (file: string, data: string) => {
  try {
    deleteIfExists(file)
    fs.writeFileSync(file, data, { mode: 0o400, encoding: 'utf8' })
  } catch {
    error(`Failed to write file ${file}, exiting.`)
    warn('Manually save the contents at the specified file location if possible, or a temporary file for recovery!!!')
    info(data)
    process.exit(1)
  }
}

export const read = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {}
}

export const isEpochDistributionStarted = (epoch: number): boolean => {
  const regex = new RegExp(`epoch-${epoch}`)

  try {
    const files = fs.readdirSync(RFOX_DIR)
    return Boolean(files.filter(file => regex.test(file)).length)
  } catch {
    return false
  }
}
