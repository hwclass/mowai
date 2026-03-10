/**
 * Filesystem shell helpers — imperative, node:* only.
 */

import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

/**
 * Extract a .tar.gz archive to destDir using Node.js streams.
 * Handles POSIX ustar format (the output of `tar czf`).
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @returns {Promise<void>}
 */
export async function extractTarGz(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const src = createReadStream(archivePath);
    const tarStream = src.pipe(gunzip);

    let buffer = Buffer.alloc(0);

    tarStream.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      processTarBuffer();
    });

    tarStream.on('end', () => {
      resolve();
    });

    tarStream.on('error', reject);
    src.on('error', reject);

    function processTarBuffer() {
      // TAR block size is 512 bytes
      while (buffer.length >= 512) {
        // Check for end-of-archive (two zero blocks)
        if (buffer.every((b) => b === 0)) {
          break;
        }

        const header = buffer.slice(0, 512);
        const name = readString(header, 0, 100);

        if (!name) {
          buffer = buffer.slice(512);
          continue;
        }

        const sizeStr = readString(header, 124, 12).trim();
        const size = parseInt(sizeStr, 8) || 0;
        const typeflag = String.fromCharCode(header[156]);

        // Total blocks needed for this entry (512 header + padded data)
        const dataBlocks = Math.ceil(size / 512);
        const totalNeeded = 512 + dataBlocks * 512;

        if (buffer.length < totalNeeded) break; // wait for more data

        const data = buffer.slice(512, 512 + size);
        buffer = buffer.slice(totalNeeded);

        // Strip leading path component (e.g. "agent-template/")
        const parts = name.split('/').filter(Boolean);
        if (parts.length === 0) continue;
        // Remove the top-level dir from tarball (e.g. "rust-template/")
        const relParts = parts.length > 1 ? parts.slice(1) : parts;
        const rel = relParts.join('/');
        if (!rel) continue;

        const fullPath = join(destDir, rel);

        if (typeflag === '5' || name.endsWith('/')) {
          // Directory
          mkdirSync(fullPath, { recursive: true });
        } else {
          // File
          const dir = dirname(fullPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          const ws = createWriteStream(fullPath);
          ws.write(data);
          ws.end();
        }
      }
    }
  });
}

function readString(buf, offset, length) {
  let end = offset;
  while (end < offset + length && buf[end] !== 0) end++;
  return buf.slice(offset, end).toString('utf8').trim();
}

/**
 * Write JSON to a file, creating parent dirs as needed.
 *
 * @param {string} filePath
 * @param {unknown} data
 */
export async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
