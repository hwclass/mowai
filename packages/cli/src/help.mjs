/**
 * Help renderer — pure function, rendered from command registry data.
 */

import { bold, dim, cyan, green } from './ansi.mjs';
import { COMMANDS, findCommand } from './commands.mjs';

/** @returns {string} */
export function renderHelp(commandName) {
  if (commandName) {
    const cmd = findCommand(commandName);
    if (!cmd) return `Unknown command: ${commandName}\n\nRun ${cyan('mowai help')} to list commands.\n`;
    return renderCommandHelp(cmd);
  }
  return renderGlobalHelp();
}

function renderGlobalHelp() {
  const lines = [
    bold('mowai') + dim(' — Molten Wasm AI agent swarm framework'),
    '',
    bold('USAGE'),
    `  mowai <command> [options]`,
    '',
    bold('COMMANDS'),
  ];
  for (const cmd of COMMANDS) {
    lines.push(`  ${green(cmd.name.padEnd(12))}  ${cmd.summary}`);
  }
  lines.push('');
  lines.push(dim(`Run "mowai help <command>" for command-specific options.`));
  lines.push('');
  return lines.join('\n');
}

function renderCommandHelp(cmd) {
  const lines = [
    bold(cmd.name) + '  —  ' + cmd.summary,
    '',
    bold('USAGE'),
    `  ${cmd.usage}`,
  ];
  if (cmd.options.length > 0) {
    lines.push('');
    lines.push(bold('OPTIONS'));
    for (const opt of cmd.options) {
      const left = `${cyan(opt.flag)} ${dim(opt.arg ?? '')}`.padEnd(32);
      lines.push(`  ${left}  ${opt.description}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
