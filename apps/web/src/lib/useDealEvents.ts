import type { DealEvent, DealEventType } from "@handshake/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const EVENT_TYPES: readonly DealEventType[] = [
  "DEAL_CREATED",
  "STATE_CHANGED",
  "ATTESTATION_ISSUED",
  "HANDSHAKE_RESULT",
  "AGENT_MESSAGE",
  "GUARD_DECISION",
  "GUARD_BYPASSED",
  "OFFER_AGREED",
  "PAYMENT_STATUS",
  "RECEIPT_SIGNED",
  "INJECTION_BLOCKED",
  "DEAL_FAILED",
  "DISPUTE_OPENED",
  "DEAL_RESOLVED",
];

export type StreamStatus = "connecting" | "live" | "offline";

export interface DealEvents {
  events: DealEvent[];
  status: StreamStatus;
  /** Bumped (at most every 400 ms) when the server persists something new. */
  revision: number;
}

/**
 * Subscribes to a deal's SSE stream.
 *
 * The server replays the persisted log on connect, so a late subscriber sees the
 * whole story. Each arriving event bumps a throttled revision so the page can
 * refetch its authoritative view without one request per event.
 */
export function useDealEvents(dealId: string, initialEvents: DealEvent[]): DealEvents {
  const [events, setEvents] = useState<DealEvent[]>(initialEvents);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const seen = useRef(new Set(initialEvents.map((event) => event.id)));

  useEffect(() => {
    seen.current = new Set(initialEvents.map((event) => event.id));
    setEvents(initialEvents);
    pending.current = false;
    setRevision(0);
    // Only re-seed when the deal changes; the stream owns the list afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  useEffect(() => {
    const source = new EventSource(api.eventsUrl(dealId));

    const scheduleRevision = () => {
      if (pending.current) return;
      pending.current = true;
      window.setTimeout(() => {
        pending.current = false;
        setRevision((value) => value + 1);
      }, 400);
    };

    const onMessage = (message: MessageEvent<string>) => {
      try {
        const incoming = JSON.parse(message.data) as DealEvent;
        if (seen.current.has(incoming.id)) return;
        seen.current.add(incoming.id);
        setEvents((current) => [...current, incoming].sort((a, b) => a.seq - b.seq));
        scheduleRevision();
      } catch {
        // A malformed frame is ignored rather than breaking the stream.
      }
    };

    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("offline");
    for (const type of EVENT_TYPES) source.addEventListener(type, onMessage as EventListener);

    return () => source.close();
  }, [dealId]);

  return { events, status, revision };
}
