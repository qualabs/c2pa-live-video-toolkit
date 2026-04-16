export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const logger = {
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
