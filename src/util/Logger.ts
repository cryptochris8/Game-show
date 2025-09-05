/**
 * Logging utility for Clueboard Trivia Game
 * Provides structured logging with levels, colors, and context
 */

import { getServerConfig } from './Config';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogContext {
  component?: string;
  playerId?: string;
  gameId?: string;
  sessionId?: string;
  action?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: Date;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  protected logLevel: LogLevel;
  private colors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '\x1b[36m', // Cyan
    [LogLevel.INFO]: '\x1b[32m',  // Green
    [LogLevel.WARN]: '\x1b[33m',  // Yellow
    [LogLevel.ERROR]: '\x1b[31m'  // Red
  };
  private levelNames: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR'
  };

  constructor() {
    this.logLevel = this.getLogLevelFromConfig();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the current log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  public info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, { ...context, error: error?.message, stack: error?.stack });
  }

  /**
   * Log a message with structured context
   */
  public log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date(),
      error: context?.error as Error
    };

    this.outputLog(entry);
  }

  /**
   * Log player action
   */
  public playerAction(playerId: string, action: string, details?: Record<string, any>): void {
    this.info(`Player action: ${action}`, {
      component: 'PlayerAction',
      playerId,
      action,
      ...details
    });
  }

  /**
   * Log game event
   */
  public gameEvent(event: string, details?: Record<string, any>): void {
    this.info(`Game event: ${event}`, {
      component: 'GameEvent',
      event,
      ...details
    });
  }

  /**
   * Log system event
   */
  public systemEvent(event: string, details?: Record<string, any>): void {
    this.info(`System event: ${event}`, {
      component: 'SystemEvent',
      event,
      ...details
    });
  }

  /**
   * Log performance metric
   */
  public performance(component: string, metric: string, value: number, unit: string = 'ms'): void {
    this.debug(`Performance: ${component}.${metric} = ${value}${unit}`, {
      component: 'Performance',
      metricComponent: component,
      metric,
      value,
      unit
    });
  }

  /**
   * Create a child logger with preset context
   */
  public child(context: LogContext): Logger {
    const childLogger = new ChildLogger(this, context);
    return childLogger;
  }

  /**
   * Output the log entry to console
   */
  private outputLog(entry: LogEntry): void {
    const color = this.colors[entry.level];
    const resetColor = '\x1b[0m';
    const levelName = this.levelNames[entry.level];
    const timestamp = entry.timestamp.toISOString();

    let output = `${color}[${timestamp}] ${levelName}${resetColor}: ${entry.message}`;

    if (entry.context) {
      const contextStr = this.formatContext(entry.context);
      if (contextStr) {
        output += ` ${color}|${resetColor} ${contextStr}`;
      }
    }

    if (entry.error) {
      output += `\n${color}Error: ${entry.error.message}${resetColor}`;
      if (entry.error.stack) {
        output += `\n${color}Stack: ${entry.error.stack}${resetColor}`;
      }
    }

    console.log(output);
  }

  /**
   * Format context object for display
   */
  private formatContext(context: LogContext): string {
    const parts: string[] = [];

    if (context.component) {
      parts.push(`component=${context.component}`);
    }

    if (context.playerId) {
      parts.push(`player=${context.playerId}`);
    }

    if (context.gameId) {
      parts.push(`game=${context.gameId}`);
    }

    if (context.action) {
      parts.push(`action=${context.action}`);
    }

    // Add other context keys
    for (const [key, value] of Object.entries(context)) {
      if (!['component', 'playerId', 'gameId', 'action', 'error', 'stack'].includes(key)) {
        parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
      }
    }

    return parts.join(', ');
  }

  /**
   * Get log level from server configuration
   */
  private getLogLevelFromConfig(): LogLevel {
    const config = getServerConfig();
    switch (config.logLevel) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }
}

/**
 * Child logger that inherits context from parent
 */
class ChildLogger extends Logger {
  private parentLogger: Logger;
  private baseContext: LogContext;

  constructor(parent: Logger, context: LogContext) {
    super();
    this.parentLogger = parent;
    this.baseContext = context;
  }

  public log(level: LogLevel, message: string, context?: LogContext): void {
    const mergedContext = { ...this.baseContext, ...context };
    this.parentLogger.log(level, message, mergedContext);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: LogContext) => logger.error(message, error, context),
  playerAction: (playerId: string, action: string, details?: Record<string, any>) => logger.playerAction(playerId, action, details),
  gameEvent: (event: string, details?: Record<string, any>) => logger.gameEvent(event, details),
  systemEvent: (event: string, details?: Record<string, any>) => logger.systemEvent(event, details),
  performance: (component: string, metric: string, value: number, unit?: string) => logger.performance(component, metric, value, unit)
};
