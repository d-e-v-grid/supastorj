/**
 * Logger implementation with audit logging support using Pino
 */

import pino from 'pino';
import { multistream, Level } from 'pino';
import pinoPretty from 'pino-pretty';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';

import { Logger } from '../types/index.js';

export interface LoggerOptions {
  level?: string;
  auditLog?: boolean;
  auditLogPath?: string;
}

export class LoggerImpl implements Logger {
  private logger: pino.Logger;
  private auditLogger?: pino.Logger;

  constructor(options: LoggerOptions = {}) {
    const { level = 'info', auditLog = true, auditLogPath = './logs/audit.log' } = options;

    // Create logs directory if it doesn't exist
    if (auditLog && auditLogPath) {
      const logDir = dirname(auditLogPath);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
    }

    // Configure pretty printing for console
    const prettyStream = pinoPretty({
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      customPrettifiers: {
        level: (inputData: string | object) => {
          const levelNum = typeof inputData === 'object' ? (inputData as any).level : parseInt(inputData);
          let levelLabel = '';
          
          if (levelNum === 10) levelLabel = 'TRACE';
          else if (levelNum === 20) levelLabel = 'DEBUG';
          else if (levelNum === 30) levelLabel = 'INFO';
          else if (levelNum === 40) levelLabel = 'WARN';
          else if (levelNum === 50) levelLabel = 'ERROR';
          else if (levelNum === 60) levelLabel = 'FATAL';
          else levelLabel = 'UNKNOWN';

          // Custom colors using chalk
          switch (levelLabel) {
            case 'ERROR':
            case 'FATAL':
              return chalk.red(`[${levelLabel}]`);
            case 'WARN':
              return chalk.yellow(`[${levelLabel}]`);
            case 'INFO':
              return chalk.blue(`[${levelLabel}]`);
            case 'DEBUG':
            case 'TRACE':
              return chalk.gray(`[${levelLabel}]`);
            default:
              return `[${levelLabel}]`;
          }
        }
      },
      messageFormat: (log: any, messageKey: string) => {
        const msg = log[messageKey];
        // Handle audit logs specially
        if (log.action) {
          return `AUDIT: ${log.action} - ${msg}`;
        }
        return msg;
      }
    });

    // Configure streams
    const streams: pino.StreamEntry[] = [
      { stream: prettyStream }
    ];

    // Main logger configuration
    this.logger = pino({
      level,
      base: null, // Remove pid and hostname from logs
      formatters: {
        level: (label: string, number: number) => {
          return { level: number };
        }
      }
    }, multistream(streams));

    // Audit logger configuration
    if (auditLog && auditLogPath) {
      this.auditLogger = pino({
        level: 'info',
        transport: {
          target: 'pino/file',
          options: { 
            destination: auditLogPath,
            mkdir: true
          }
        }
      });
    }
  }

  debug(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.logger.debug(meta, message);
    } else {
      this.logger.debug(message);
    }
  }

  info(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.logger.info(meta, message);
    } else {
      this.logger.info(message);
    }
  }

  warn(message: string, meta?: any): void {
    if (meta !== undefined) {
      this.logger.warn(meta, message);
    } else {
      this.logger.warn(message);
    }
  }

  error(message: string, meta?: any): void {
    if (meta !== undefined) {
      // Handle different types of meta
      if (typeof meta === 'string') {
        this.logger.error(`${message} ${meta}`);
      } else if (meta instanceof Error) {
        this.logger.error({ 
          err: meta,
          stack: meta.stack,
          message: meta.message 
        }, message);
      } else {
        this.logger.error(meta, message);
      }
    } else {
      this.logger.error(message);
    }
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
      this.auditLogger.info(auditEntry, `AUDIT: ${action}`);
    }

    // Also log to main logger at debug level
    this.logger.debug(auditEntry, `AUDIT: ${action}`);
  }

  /**
   * Create a child logger with additional context
   */
  child(childMeta: any): Logger {
    const childPino = this.logger.child(childMeta);
    
    return {
      debug: (message: string, meta?: any) => {
        if (meta !== undefined) {
          childPino.debug(meta, message);
        } else {
          childPino.debug(message);
        }
      },
      info: (message: string, meta?: any) => {
        if (meta !== undefined) {
          childPino.info(meta, message);
        } else {
          childPino.info(message);
        }
      },
      warn: (message: string, meta?: any) => {
        if (meta !== undefined) {
          childPino.warn(meta, message);
        } else {
          childPino.warn(message);
        }
      },
      error: (message: string, meta?: any) => {
        if (meta !== undefined) {
          childPino.error(meta, message);
        } else {
          childPino.error(message);
        }
      },
      audit: (action: string, meta?: any) => this.audit(action, { ...childMeta, ...meta }),
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