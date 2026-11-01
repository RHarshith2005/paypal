import type { DealEvent } from "@handshake/shared";

type Listener = (event: DealEvent) => void;

/**
 * In-process pub/sub for the SSE endpoint. Events are persisted first and
 * published second, so a client that connects late (or reconnects) replays the
 * persisted log and never depends on having caught the live broadcast.
 */
export class DealEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(dealId: string, listener: Listener): () => void {
    const set = this.listeners.get(dealId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(dealId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(dealId);
    };
  }

  publish(event: DealEvent): void {
    for (const listener of this.listeners.get(event.dealId) ?? []) {
      try {
        listener(event);
      } catch {
        // A broken subscriber must never break the pipeline.
      }
    }
  }

  listenerCount(dealId: string): number {
    return this.listeners.get(dealId)?.size ?? 0;
  }
}
