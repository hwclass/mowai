/**
 * mowai init — functional core + imperative shell.
 *
 * Functional core: pure functions that compute values, no I/O.
 * Imperative shell: orchestrates I/O at the bottom of this file.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { fetchJson, downloadFile } from '../shell/net.mjs';
import { extractTarGz, writeJson } from '../shell/fs.mjs';
import { randomAgentName, randomColor } from '../namegen.mjs';
import { spinner } from '../spinner.mjs';
import { green, bold, dim, yellow, cyan } from '../ansi.mjs';

const CDN_BASE = process.env.MOWAI_CDN ?? 'https://cdn.mowai.dev';
const VALID_LANGS = new Set(['rust', 'go', 'js']);

// ── Functional core ───────────────────────────────────────────────────────────

/**
 * Fetch the release manifest and return the tarball URL + checksum for a lang.
 *
 * @param {string} lang
 * @param {string} [version]  defaults to 'latest'
 * @returns {Promise<{ url: string, sha256: string, version: string }>}
 */
export async function resolveRelease(lang, version) {
  const tag = version ?? 'latest';
  const manifest = await fetchJson(`${CDN_BASE}/${tag}/manifest.json`);
  const entry = manifest.templates?.[lang];
  if (!entry) throw new Error(`No template for language "${lang}" in manifest`);
  return { url: entry.url, sha256: entry.sha256, version: manifest.version };
}

/**
 * Verify the SHA-256 checksum of a file.
 *
 * @param {string} filePath
 * @param {string} expectedSha256
 * @returns {Promise<boolean>}
 */
export function verifyChecksum(filePath, expectedSha256) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex') === expectedSha256));
    stream.on('error', reject);
  });
}

/**
 * Build the default mowai.config.json content.
 *
 * @param {string} agentName
 * @param {string} color
 * @param {string} [persona]
 * @returns {object}
 */
export function buildDefaultConfig(agentName, color, persona = 'contrarian') {
  return {
    persona,
    agent: { name: agentName, color },
  };
}

/**
 * Render the post-init next-steps banner.
 *
 * @param {string} destDir
 * @param {string} agentName
 * @returns {string}
 */
export function renderBanner(destDir, agentName) {
  const rel = destDir.replace(process.cwd() + '/', './');
  return [
    '',
    green('✓') + ' ' + bold(`Agent scaffolded in ${rel}`),
    '',
    `  1. Edit ${cyan('mowai.config.json')}  ${dim('← pick your persona + rename your agent')}`,
    `  2. ${cyan('npx mowai dev --arena wss://arena.mowai.dev')}`,
    '',
    dim('  Want to modify the agent logic and recompile?'),
    dim(`  → Run ${yellow('./setup.sh')} to install the toolchain (optional)`),
    dim(`  → Run ${yellow('./build.sh')} to recompile dist/agent.wasm (optional)`),
    '',
    dim('  Personas available: contrarian, synthesiser, first-principles,'),
    dim('                      devils-advocate, pragmatist'),
    '',
  ].join('\n');
}

// ── Imperative shell ──────────────────────────────────────────────────────────

/**
 * @param {{ lang?: string, name?: string, dir?: string }} args
 */
export async function runInit({ lang, name, dir } = {}) {
  if (!lang || !VALID_LANGS.has(lang)) {
    process.stderr.write(`Usage: mowai init --lang <${[...VALID_LANGS].join('|')}>\n`);
    process.exitCode = 1;
    return;
  }

  const agentName = name ?? randomAgentName();
  const color = randomColor();
  const destDir = resolve(dir ?? agentName);

  // Idempotency: detect existing directory
  if (existsSync(destDir)) {
    const answer = await prompt(
      `Directory ${dim(destDir)} already exists. Overwrite? [y/N] `,
    );
    if (answer.trim().toLowerCase() !== 'y') {
      process.stdout.write('Aborted.\n');
      return;
    }
    await rm(destDir, { recursive: true, force: true });
  }

  const spin = spinner(`Fetching release manifest…`);

  let release;
  try {
    release = await resolveRelease(lang);
    spin.stop(green('✓') + ' Manifest fetched');
  } catch (err) {
    spin.stop();
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const tmpDir = join(process.env.TMPDIR ?? '/tmp', `mowai-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const tarPath = join(tmpDir, `template-${lang}.tar.gz`);

  const dlSpin = spinner(`Downloading ${lang} template v${release.version}…`);
  try {
    await downloadFile(release.url, tarPath, (downloaded, total) => {
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        dlSpin.stop();
        process.stderr.write(`\r${dim(`Downloading… ${pct}%`)}`);
      }
    });
    process.stderr.write('\n');
    dlSpin.stop(green('✓') + ` Downloaded template`);
  } catch (err) {
    dlSpin.stop();
    process.stderr.write(`Error downloading template: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const cspin = spinner('Verifying checksum…');
  const valid = await verifyChecksum(tarPath, release.sha256);
  if (!valid) {
    cspin.stop();
    process.stderr.write('Error: Checksum mismatch — download may be corrupted\n');
    process.exitCode = 1;
    return;
  }
  cspin.stop(green('✓') + ' Checksum verified');

  const xspin = spinner('Extracting…');
  await extractTarGz(tarPath, destDir);
  xspin.stop(green('✓') + ' Extracted');

  // Patch mowai.config.json with generated name + color
  const configPath = join(destDir, 'mowai.config.json');
  const config = buildDefaultConfig(agentName, color);
  await writeJson(configPath, config);

  // Clean up temp dir
  await rm(tmpDir, { recursive: true, force: true });

  process.stdout.write(renderBanner(destDir, agentName));
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
