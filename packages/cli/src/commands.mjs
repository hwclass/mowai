/**
 * Command registry — pure data, no side effects.
 */

export const COMMANDS = [
  {
    name: 'init',
    summary: 'Download a language template and scaffold a new agent',
    usage: 'mowai init --lang <rust|go|js> [--name <name>] [--dir <path>]',
    options: [
      { flag: '--lang', arg: '<rust|go|js>', description: 'Template language (required)' },
      { flag: '--name', arg: '<name>', description: 'Agent name (default: random)' },
      { flag: '--dir',  arg: '<path>', description: 'Output directory (default: ./<name>)' },
    ],
  },
  {
    name: 'dev',
    summary: 'Start the local participant dev server and open browser',
    usage: 'mowai dev [--port <n>] [--arena <ws-url>] [--config <path>]',
    options: [
      { flag: '--port',   arg: '<n>',      description: 'Local HTTP port (default: 3000)' },
      { flag: '--arena',  arg: '<ws-url>', description: 'Arena WebSocket URL (default: wss://arena.mowai.dev)' },
      { flag: '--config', arg: '<path>',   description: 'Path to mowai.config.json (default: ./mowai.config.json)' },
    ],
  },
  {
    name: 'personas',
    summary: 'List available personas',
    usage: 'mowai personas',
    options: [],
  },
  {
    name: 'help',
    summary: 'Show help for a command',
    usage: 'mowai help [command]',
    options: [],
  },
  {
    name: 'version',
    summary: 'Print the CLI version',
    usage: 'mowai version',
    options: [],
  },
];

/** @param {string} name */
export function findCommand(name) {
  return COMMANDS.find((c) => c.name === name) ?? null;
}
