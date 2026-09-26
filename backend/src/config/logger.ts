import type { AppLogger } from "../types/logger.js";

export const defaultLogger: AppLogger = {
  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(message, `${error.name}: ${error.message}`);
      return;
    }

    console.error(message);
  },
};
