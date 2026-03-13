export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: any;
}

/** Logger interface */
export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}
