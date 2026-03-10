/**
 * ANSI colour helpers — pure functions, no deps.
 */

const ESC = '\x1b[';

export const reset = (s) => `${ESC}0m${s}${ESC}0m`;
export const bold = (s) => `${ESC}1m${s}${ESC}0m`;
export const dim = (s) => `${ESC}2m${s}${ESC}0m`;
export const green = (s) => `${ESC}32m${s}${ESC}0m`;
export const yellow = (s) => `${ESC}33m${s}${ESC}0m`;
export const cyan = (s) => `${ESC}36m${s}${ESC}0m`;
export const red = (s) => `${ESC}31m${s}${ESC}0m`;

/** Hide cursor */
export const hideCursor = () => `${ESC}?25l`;
/** Show cursor */
export const showCursor = () => `${ESC}?25h`;
/** Move cursor to column 1 */
export const cr = () => '\r';
/** Clear to end of line */
export const clearLine = () => `${ESC}2K\r`;
