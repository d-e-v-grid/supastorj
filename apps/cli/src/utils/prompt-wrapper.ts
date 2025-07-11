/**
 * Wrapper utilities for prompts to handle logger conflicts
 */

import { Logger } from '../types/index.js';

/**
 * Wrapper for prompt functions that handles logger silencing
 * @param logger - Logger instance to manage
 * @param promptFn - Async function that shows the prompt
 * @returns Result of the prompt function
 */
export async function withPrompt<T>(
  logger: Logger,
  promptFn: () => Promise<T>
): Promise<T> {
  try {
    // Silence logger and flush any buffered output
    logger.silence?.();
    logger.flush?.();
    
    // Add small delay to ensure output is flushed
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Execute prompt
    const result = await promptFn();
    
    // Restore logger
    logger.unsilence?.();
    
    return result;
  } catch (error) {
    // Ensure logger is restored even on error
    logger.unsilence?.();
    throw error;
  }
}

/**
 * Wrapper for Ink render that manages logger output
 * @param logger - Logger instance to manage
 * @param renderFn - Function that renders the Ink app
 * @returns Cleanup function
 */
export function withInkRender(
  logger: Logger,
  renderFn: () => { waitUntilExit: () => Promise<void> }
): { waitUntilExit: () => Promise<void> } {
  // Silence logger before rendering
  logger.silence?.();
  logger.flush?.();
  
  const app = renderFn();
  
  // Wrap waitUntilExit to restore logger
  const originalWaitUntilExit = app.waitUntilExit;
  app.waitUntilExit = async () => {
    try {
      await originalWaitUntilExit();
    } finally {
      logger.unsilence?.();
    }
  };
  
  return app;
}