import chalk from 'chalk'

export const info = (text: string) => {
  console.log(chalk.white('- ') + chalk.dim.white(text))
}

export const warn = (text: string) => {
  console.log(chalk.yellow('* ') + chalk.yellow(text))
}

export const error = (text: string) => {
  console.log(chalk.red('! ') + chalk.bold.red(text))
}
