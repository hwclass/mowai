/**
 * mowai personas — list available personas.
 *
 * Reads from local ./personas/ if it exists (inside a template dir),
 * otherwise falls back to the built-in personas bundled with the CLI.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bold, cyan, dim } from '../ansi.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILTIN_PERSONAS_DIR = resolve(__dirname, '../../../../../personas');

// ── Functional core ───────────────────────────────────────────────────────────

/**
 * Read frontmatter description from a SKILL.md file.
 *
 * @param {string} filePath
 * @returns {{ name: string, description: string }}
 */
export function parseSkillFrontmatter(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: 'unknown', description: '' };

  const fm = match[1];
  const nameLine = fm.match(/^name:\s*(.+)$/m);
  const descLine = fm.match(/^description:\s*([\s\S]+?)(?=\n\w|\n---|\s*$)/m);

  const name = nameLine?.[1]?.trim() ?? 'unknown';
  // description may span multiple lines (YAML block scalar with leading spaces)
  const description = descLine?.[1]
    ?.split('\n')
    .map((l) => l.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() ?? '';

  return { name, description };
}

/**
 * Load all personas from a directory.
 *
 * @param {string} personasDir
 * @returns {Array<{ name: string, description: string }>}
 */
export function loadPersonas(personasDir) {
  if (!existsSync(personasDir)) return [];

  const entries = readdirSync(personasDir, { withFileTypes: true });
  const personas = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(personasDir, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    personas.push(parseSkillFrontmatter(skillPath));
  }

  return personas.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Render the personas table as a string.
 *
 * @param {Array<{ name: string, description: string }>} personas
 * @returns {string}
 */
export function renderPersonasTable(personas) {
  if (personas.length === 0) {
    return `No personas found.\n`;
  }
  const MAX_DESC = 60;
  const lines = [
    bold('PERSONAS'),
    '',
    `  ${dim('Name'.padEnd(20))}  ${dim('Description')}`,
    `  ${dim('-'.repeat(18))}  ${dim('-'.repeat(MAX_DESC))}`,
  ];
  for (const p of personas) {
    const desc = p.description.length > MAX_DESC
      ? p.description.slice(0, MAX_DESC - 1) + '…'
      : p.description;
    lines.push(`  ${cyan(p.name.padEnd(20))}  ${desc}`);
  }
  lines.push('');
  lines.push(dim(`  Edit mowai.config.json to change persona — no recompile needed.`));
  lines.push('');
  return lines.join('\n');
}

// ── Imperative shell ──────────────────────────────────────────────────────────

export async function runPersonas() {
  // Prefer local personas/ dir (inside a template), fall back to built-in
  const localDir = join(process.cwd(), 'personas');
  const dir = existsSync(localDir) ? localDir : BUILTIN_PERSONAS_DIR;

  const personas = loadPersonas(dir);
  process.stdout.write(renderPersonasTable(personas));
}
