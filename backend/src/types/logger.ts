export interface AppLogger {
  error(message: string, error?: unknown): void;
}
