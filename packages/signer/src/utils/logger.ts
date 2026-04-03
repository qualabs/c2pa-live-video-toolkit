import { config } from '../config.js';

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (config.debug) console.log(message, ...args);
  },
  info: (message: string, ...args: unknown[]): void => {
    console.log(message, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(message, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(message, ...args);
  },
};
