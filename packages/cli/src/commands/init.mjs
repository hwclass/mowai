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

import { fetchJson, fetchText, downloadFile } from '../shell/net.mjs';
import { extractTarGz, writeJson } from '../shell/fs.mjs';
import { randomAgentName, randomColor } from '../namegen.mjs';
import { spinner } from '../spinner.mjs';
import { green, bold, dim, yellow, cyan } from '../ansi.mjs';

const GITHUB_REPO = process.env.MOWAI_GITHUB_REPO ?? 'hwclass/mowai';
const VALID_LANGS = new Set(['rust', 'go', 'js']);

// ── Functional core ───────────────────────────────────────────────────────────

/**
 * Resolve the tarball URL + checksum for a language template from GitHub Releases.
 *
 * @param {string} lang
 * @param {string} [version]  tag name e.g. 'v0.1.0'; defaults to latest release
 * @returns {Promise<{ url: string, sha256: string, version: string }>}
 */
export async function resolveRelease(lang, version) {
  const apiUrl = version
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${version}`
    : `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const release = await fetchJson(apiUrl);
  const tag = release.tag_name;
  const tarballName = `${lang}-${tag}.tar.gz`;
  const checksumName = `${lang}-${tag}.tar.gz.sha256`;
  const tarballAsset = release.assets?.find((a) => a.name === tarballName);
  const checksumAsset = release.assets?.find((a) => a.name === checksumName);
  if (!tarballAsset) throw new Error(`No "${lang}" template in release ${tag}`);
  let sha256 = '';
  if (checksumAsset) {
    const raw = await fetchText(checksumAsset.browser_download_url);
    sha256 = raw.trim().split(/\s/)[0];
  }
  return { url: tarballAsset.browser_download_url, sha256, version: tag };
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
