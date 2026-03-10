#!/usr/bin/env node
/**
 * mowai CLI — imperative entry point.
 * Zero npm deps: node:* builtins only.
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { renderHelp } from '../src/help.mjs';
import { red } from '../src/ansi.mjs';

// ── Version ───────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const VERSION = pkg.version ?? '0.0.0';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help:    { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    lang:    { type: 'string' },
    name:    { type: 'string' },
    dir:     { type: 'string' },
    port:    { type: 'string' },
    arena:   { type: 'string' },
    config:  { type: 'string' },
  },
  allowPositionals: true,
  strict: false,
});

const command = positionals[0];

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function main() {
  if (values.version) {
    process.stdout.write(`mowai v${VERSION}\n`);
    return;
  }

  if (!command || command === 'help' || values.help) {
    process.stdout.write(renderHelp(positionals[1] ?? command === 'help' ? positionals[1] : null));
    return;
  }

  if (command === 'version') {
    process.stdout.write(`mowai v${VERSION}\n`);
    return;
  }

  if (command === 'init') {
    const { runInit } = await import('../src/commands/init.mjs');
    await runInit({ lang: values.lang, name: values.name, dir: values.dir });
    return;
  }

  if (command === 'dev') {
    const { runDev } = await import('../src/commands/dev.mjs');
    await runDev({
      port: values.port ? Number(values.port) : 3000,
      arena: values.arena ?? 'wss://arena.mowai.dev',
      config: values.config ?? './mowai.config.json',
    });
    return;
  }

  if (command === 'personas') {
    const { runPersonas } = await import('../src/commands/personas.mjs');
    await runPersonas();
    return;
  }

  process.stderr.write(`${red('Error:')} Unknown command: ${command}\n\n`);
  process.stdout.write(renderHelp());
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${red('Error:')} ${err.message}\n`);
  process.exitCode = 1;
});
