/**
 * Event bus tests
 */

import { it, vi, expect, describe } from 'vitest';

import { EventType } from '../src/types/index.js';
import { EventBusImpl } from '../src/core/event-bus.js';

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const eventBus = new EventBusImpl();
    const handler = vi.fn();

    eventBus.on(EventType.ServiceStart, handler);
    eventBus.emit(EventType.ServiceStart, { service: 'test' });

    expect(handler).toHaveBeenCalledWith({ service: 'test' });
  });

  it('should handle multiple handlers for the same event', () => {
    const eventBus = new EventBusImpl();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    eventBus.on(EventType.ServiceStart, handler1);
    eventBus.on(EventType.ServiceStart, handler2);
    eventBus.emit(EventType.ServiceStart, { service: 'test' });

    expect(handler1).toHaveBeenCalledWith({ service: 'test' });
    expect(handler2).toHaveBeenCalledWith({ service: 'test' });
  });

  it('should remove event handlers', () => {
    const eventBus = new EventBusImpl();
    const handler = vi.fn();

    eventBus.on(EventType.ServiceStart, handler);
    eventBus.off(EventType.ServiceStart, handler);
    eventBus.emit(EventType.ServiceStart, { service: 'test' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle once handlers', () => {
    const eventBus = new EventBusImpl();
    const handler = vi.fn();

    eventBus.once(EventType.ServiceStart, handler);
    eventBus.emit(EventType.ServiceStart, { service: 'test1' });
    eventBus.emit(EventType.ServiceStart, { service: 'test2' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ service: 'test1' });
  });

  it('should wait for events', async () => {
    const eventBus = new EventBusImpl();

    setTimeout(() => {
      eventBus.emit(EventType.ServiceStart, { service: 'delayed' });
    }, 10);

    const data = await eventBus.waitFor(EventType.ServiceStart);
    expect(data).toEqual({ service: 'delayed' });
  });

  it('should timeout when waiting for events', async () => {
    const eventBus = new EventBusImpl();

    await expect(
      eventBus.waitFor(EventType.ServiceStart, 10)
    ).rejects.toThrow('Timeout waiting for event');
  });
});