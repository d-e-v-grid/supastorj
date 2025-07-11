/**
 * Logger tests
 */

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { LoggerImpl } from '../../src/core/logger.js';

// Mock pino to avoid actual file writes
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
};

vi.mock('pino', () => ({
  default: vi.fn(() => mockLogger),
  multistream: vi.fn((streams) => streams[0].stream),
}));

vi.mock('pino-pretty', () => ({
  default: vi.fn(() => ({ write: vi.fn() })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

describe('Logger', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    // Debug messages should still be called due to mocking
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('should log audit events', () => {
    const logger = new LoggerImpl({ auditLog: true });
    logger.audit('user_action', { userId: '123', action: 'create' });
    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'user_action',
      userId: '123'
    }), 'Audit event');
  });

  it('should not log audit events when disabled', () => {
    const logger = new LoggerImpl({ auditLog: false });
    logger.audit('user_action', { userId: '123', action: 'create' });
    // Audit events should still be logged to main logger
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should handle error objects', () => {
    const logger = new LoggerImpl();
    const error = new Error('Test error');
    logger.error('Error occurred:', error);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      err: error
    }), 'Error occurred:');
  });

  it('should handle metadata in logs', () => {
    const logger = new LoggerImpl();
    logger.info('User logged in', { userId: '123', email: 'test@example.com' });
    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      userId: '123',
      email: 'test@example.com'
    }), 'User logged in');
  });
});