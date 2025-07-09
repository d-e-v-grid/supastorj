/**
 * Event bus implementation for decoupled communication
 */

import { EventBus, EventHandler, EventType } from '../types/index.js';

export class EventBusImpl implements EventBus {
  private handlers: Map<EventType, Set<EventHandler>> = new Map();
  private onceHandlers: Map<EventType, Set<EventHandler>> = new Map();

  emit<T = any>(event: EventType, data?: T): void {
    // Execute regular handlers
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          const result = handler(data);
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`Error in event handler for ${event}:`, error);
            });
          }
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }

    // Execute once handlers and remove them
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      onceHandlers.forEach(handler => {
        try {
          const result = handler(data);
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`Error in once handler for ${event}:`, error);
            });
          }
        } catch (error) {
          console.error(`Error in once handler for ${event}:`, error);
        }
      });
      this.onceHandlers.delete(event);
    }
  }

  on<T = any>(event: EventType, handler: EventHandler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }

    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      onceHandlers.delete(handler);
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(event);
      }
    }
  }

  once<T = any>(event: EventType, handler: EventHandler<T>): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * Remove all handlers for a specific event
   */
  removeAllListeners(event?: EventType): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: EventType): number {
    const regularCount = this.handlers.get(event)?.size || 0;
    const onceCount = this.onceHandlers.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<T = any>(event: EventType, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            this.off(event, handler);
            reject(new Error(`Timeout waiting for event: ${event}`));
          }, timeout)
        : null;

      const handler: EventHandler<T> = (data) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      };

      this.once(event, handler);
    });
  }
}