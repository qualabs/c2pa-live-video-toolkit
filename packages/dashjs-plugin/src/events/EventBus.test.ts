import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus.js';

describe('EventBus', () => {
  it('fires a registered listener when the event is emitted', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('reset', listener);
    bus.emit('reset', {});
    expect(listener).toHaveBeenCalledOnce();
  });

  it('passes the payload to the listener', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('segmentsMissing', listener);
    bus.emit('segmentsMissing', { from: 1, to: 3, count: 3 });
    expect(listener).toHaveBeenCalledWith({ from: 1, to: 3, count: 3 });
  });

  it('fires all registered listeners for the same event', () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.on('reset', first);
    bus.on('reset', second);
    bus.emit('reset', {});
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('does not fire a listener after off() is called', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('reset', listener);
    bus.off('reset', listener);
    bus.emit('reset', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires a once() listener exactly once across multiple emits', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.once('reset', listener);
    bus.emit('reset', {});
    bus.emit('reset', {});
    expect(listener).toHaveBeenCalledOnce();
  });

  it('removeAllListeners stops all events from firing', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('reset', listener);
    bus.on('segmentsMissing', listener);
    bus.removeAllListeners();
    bus.emit('reset', {});
    bus.emit('segmentsMissing', { from: 1, to: 1, count: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});
