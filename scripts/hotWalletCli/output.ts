import chalk from 'chalk'

export const info = (text: string) => {
  console.log(chalk.yellow('* ') + chalk.dim.yellow(text))
}

export const error = (text: string) => {
  console.log(chalk.red('! ') + chalk.red(text))
}
