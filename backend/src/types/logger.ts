export interface AppLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}
