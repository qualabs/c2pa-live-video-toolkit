import type { C2paEventMap, C2paEventType } from '../types.js';

type EventListener<T extends C2paEventType> = (payload: C2paEventMap[T]) => void;

type ListenerEntry<T extends C2paEventType> = {
  listener: EventListener<T>;
  once: boolean;
};

export class EventBus {
  private readonly listeners = new Map<
    C2paEventType,
    ListenerEntry<C2paEventType>[]
  >();

  on<T extends C2paEventType>(event: T, listener: EventListener<T>): void {
    this.addListener(event, listener, false);
  }

  once<T extends C2paEventType>(event: T, listener: EventListener<T>): void {
    this.addListener(event, listener, true);
  }

  off<T extends C2paEventType>(event: T, listener: EventListener<T>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const filtered = entries.filter(
      (entry) => entry.listener !== (listener as EventListener<C2paEventType>),
    );
    this.listeners.set(event, filtered);
  }

  emit<T extends C2paEventType>(event: T, payload: C2paEventMap[T]): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const remaining: ListenerEntry<C2paEventType>[] = [];
    for (const entry of entries) {
      (entry.listener as EventListener<T>)(payload);
      if (!entry.once) {
        remaining.push(entry);
      }
    }
    this.listeners.set(event, remaining);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  private addListener<T extends C2paEventType>(
    event: T,
    listener: EventListener<T>,
    once: boolean,
  ): void {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ listener: listener as EventListener<C2paEventType>, once });
    this.listeners.set(event, entries);
  }
}
