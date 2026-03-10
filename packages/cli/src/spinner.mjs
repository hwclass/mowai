/**
 * Terminal spinner — imperative, uses setInterval + ANSI cursor control.
 * Returns a { stop } handle.
 */

import { clearLine, hideCursor, showCursor, cyan } from './ansi.mjs';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * @param {string} text
 * @returns {{ stop: (finalText?: string) => void }}
 */
export function spinner(text) {
  let frame = 0;
  process.stderr.write(hideCursor());
  const interval = setInterval(() => {
    process.stderr.write(`${clearLine()}${cyan(FRAMES[frame % FRAMES.length])} ${text}`);
    frame++;
  }, 80);

  return {
    stop(finalText) {
      clearInterval(interval);
      process.stderr.write(`${clearLine()}${showCursor()}`);
      if (finalText) process.stderr.write(`${finalText}\n`);
    },
  };
}
