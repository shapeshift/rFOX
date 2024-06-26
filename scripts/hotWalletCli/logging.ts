import chalk from 'chalk'
import symbols from 'log-symbols'

export const info = (text: string) => {
  console.log(symbols.info, chalk.dim.white(text))
}

export const warn = (text: string) => {
  console.log(symbols.warning, chalk.yellow(text))
}

export const error = (text: string) => {
  console.log(symbols.error, chalk.bold.red(text))
}

export const success = (text: string) => {
  console.log(symbols.success, chalk.green(text))
}
