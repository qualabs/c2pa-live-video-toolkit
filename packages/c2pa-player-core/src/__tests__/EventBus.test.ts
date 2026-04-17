import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/EventBus.js';

const sampleErrorPayload = { source: 'test', error: new Error('boom') };

describe('EventBus', () => {
  it('fires a registered listener when the event is emitted', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('error', listener);
    bus.emit('error', sampleErrorPayload);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('passes the payload to the listener', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('error', listener);
    bus.emit('error', sampleErrorPayload);
    expect(listener).toHaveBeenCalledWith(sampleErrorPayload);
  });

  it('fires all registered listeners for the same event', () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.on('error', first);
    bus.on('error', second);
    bus.emit('error', sampleErrorPayload);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('does not fire a listener after off() is called', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('error', listener);
    bus.off('error', listener);
    bus.emit('error', sampleErrorPayload);
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires a once() listener exactly once across multiple emits', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.once('error', listener);
    bus.emit('error', sampleErrorPayload);
    bus.emit('error', sampleErrorPayload);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('removeAllListeners stops all events from firing', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('error', listener);
    bus.removeAllListeners();
    bus.emit('error', sampleErrorPayload);
    expect(listener).not.toHaveBeenCalled();
  });
});
