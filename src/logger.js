import chalk from 'chalk';

const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg) => console.log(`${chalk.gray(ts())} ${chalk.blue('INFO')}  ${msg}`),
  ok: (msg) => console.log(`${chalk.gray(ts())} ${chalk.green('OK')}    ${msg}`),
  warn: (msg) => console.log(`${chalk.gray(ts())} ${chalk.yellow('WARN')}  ${msg}`),
  err: (msg) => console.log(`${chalk.gray(ts())} ${chalk.red('ERR')}   ${msg}`),
  step: (msg) => console.log(`\n${chalk.bold.magenta('━━')} ${chalk.bold(msg)} ${chalk.bold.magenta('━━')}`),
  dim: (msg) => console.log(`${chalk.gray(ts())} ${chalk.gray(msg)}`),
};
