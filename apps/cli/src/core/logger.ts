/**
 * Logger implementation with audit logging support
 */

import chalk from 'chalk';
import winston from 'winston';

import { Logger } from '../types/index.js';

export interface LoggerOptions {
  level?: string;
  auditLog?: boolean;
  auditLogPath?: string;
}

export class LoggerImpl implements Logger {
  private logger: winston.Logger;
  private auditLogger?: winston.Logger;

  constructor(options: LoggerOptions = {}) {
    const { level = 'info', auditLog = true, auditLogPath = './logs/audit.log' } = options;

    // Console format with colors
    const consoleFormat = winston.format.printf(({ level: logLevel, message, timestamp, ...meta }) => {
      const coloredLevel = this.colorizeLevel(logLevel);
      const formattedMeta = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${chalk.gray(timestamp)} ${coloredLevel} ${message}${formattedMeta}`;
    });

    // Main logger configuration
    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            consoleFormat
          ),
        }),
      ],
    });

    // Audit logger configuration
    if (auditLog) {
      this.auditLogger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.File({
            filename: auditLogPath,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
        ],
      });
    }
  }

  private colorizeLevel(level: string): string {
    switch (level) {
      case 'error':
        return chalk.red(`[${level.toUpperCase()}]`);
      case 'warn':
        return chalk.yellow(`[${level.toUpperCase()}]`);
      case 'info':
        return chalk.blue(`[${level.toUpperCase()}]`);
      case 'debug':
        return chalk.gray(`[${level.toUpperCase()}]`);
      default:
        return `[${level.toUpperCase()}]`;
    }
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  audit(action: string, meta?: any): void {
    const auditEntry = {
      action,
      timestamp: new Date().toISOString(),
      user: process.env['USER'] || 'unknown',
      pid: process.pid,
      ...meta,
    };

    if (this.auditLogger) {
      this.auditLogger.info('AUDIT', auditEntry);
    }

    // Also log to main logger at debug level
    this.logger.debug(`AUDIT: ${action}`, auditEntry);
  }

  /**
   * Create a child logger with additional context
   */
  child(childMeta: any): Logger {
    const childWinston = this.logger.child(childMeta);
    
    return {
      debug: (message: string, meta?: any) => childWinston.debug(message, meta),
      info: (message: string, meta?: any) => childWinston.info(message, meta),
      warn: (message: string, meta?: any) => childWinston.warn(message, meta),
      error: (message: string, meta?: any) => childWinston.error(message, meta),
      audit: (action: string, meta?: any) => this.audit(action, { ...childWinston.defaultMeta, ...meta }),
    };
  }

  /**
   * Set the log level
   */
  setLevel(level: string): void {
    this.logger.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): string {
    return this.logger.level;
  }
}