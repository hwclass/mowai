/**
 * Network shell helpers — imperative, node:https only.
 */

import { createWriteStream } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';

/**
 * Download a URL to a file path, calling onProgress with bytes downloaded.
 *
 * @param {string} url
 * @param {string} destPath
 * @param {(downloaded: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? httpsGet : httpGet;
    const file = createWriteStream(destPath);

    const request = get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        resolve(downloadFile(res.headers.location, destPath, onProgress));
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }

      const total = Number(res.headers['content-length'] ?? 0);
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        onProgress?.(downloaded, total);
      });

      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Fetch a URL and return parsed JSON.
 *
 * @param {string} url
 * @returns {Promise<unknown>}
 */
export function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? httpsGet : httpGet;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchJson(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
