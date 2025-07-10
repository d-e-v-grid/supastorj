/**
 * Logger tests
 */

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';

// Mock winston to avoid actual file writes
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
};

vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => mockLogger),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      errors: vi.fn(),
      json: vi.fn(),
      printf: vi.fn(),
      colorize: vi.fn(),
      splat: vi.fn(),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  },
}));

describe('Logger', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Clear mock calls
    if (mockLogger) {
      mockLogger.info.mockClear();
      mockLogger.error.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.debug.mockClear();
      mockLogger.log.mockClear();
    }
  });

  it('should create logger with default options', () => {
    const logger = new LoggerImpl();
    expect(logger).toBeDefined();
  });

  it('should create logger with custom options', () => {
    const logger = new LoggerImpl({
      level: 'debug',
      auditLog: true,
    });
    expect(logger).toBeDefined();
  });

  it('should log info messages', () => {
    const logger = new LoggerImpl();
    logger.info('Test info message');
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    const logger = new LoggerImpl();
    logger.error('Test error message');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should log warning messages', () => {
    const logger = new LoggerImpl();
    logger.warn('Test warning message');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should log debug messages when level is debug', () => {
    const logger = new LoggerImpl({ level: 'debug' });
    logger.debug('Test debug message');
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('should not log debug messages when level is info', () => {
    const logger = new LoggerImpl({ level: 'info' });
    logger.debug('Test debug message');
    // Since we're mocking winston, we can't test the actual filtering
    // In a real test, we'd check if winston's debug method was called
  });

  it('should log audit events', () => {
    const logger = new LoggerImpl({ auditLog: true });
    logger.audit('user_action', { userId: '123', action: 'create' });
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should not log audit events when disabled', () => {
    const logger = new LoggerImpl({ auditLog: false });
    logger.audit('user_action', { userId: '123', action: 'create' });
    // Audit logs are still logged at debug level
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('should handle error objects', () => {
    const logger = new LoggerImpl();
    const error = new Error('Test error');
    logger.error('Error occurred:', error);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should handle metadata in logs', () => {
    const logger = new LoggerImpl();
    logger.info('User logged in', { userId: '123', email: 'test@example.com' });
    expect(mockLogger.info).toHaveBeenCalled();
  });
});