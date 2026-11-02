import type { DealEvent, DealEventType } from "@handshake/shared";
import { formatDateTime } from "../lib/format";
import type { StreamStatus } from "../lib/useDealEvents";
import { Badge, Panel } from "./ui";

const EVENT_TONE: Partial<Record<DealEventType, "emerald" | "amber" | "rose" | "sky" | "zinc">> = {
  RECEIPT_SIGNED: "emerald",
  DEAL_RESOLVED: "emerald",
  OFFER_AGREED: "emerald",
  DEAL_FAILED: "rose",
  INJECTION_BLOCKED: "amber",
  GUARD_BYPASSED: "amber",
  GUARD_DECISION: "sky",
  PAYMENT_STATUS: "sky",
};

/**
 * Typed events pushed over server-sent events as the pipeline persists them.
 * The list is owned by `useDealEvents`, which replays the persisted log first, so
 * what you see is the same story the ledger holds.
 */
export function DealEventStream({
  events,
  status,
  className = "",
}: {
  events: DealEvent[];
  status: StreamStatus;
  className?: string;
}) {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  return (
    <Panel
      className={className}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Live deal stream
          <Badge tone={status === "live" ? "emerald" : status === "offline" ? "amber" : "zinc"} mono>
            <span
              className={status === "live" ? "live-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" : ""}
            />
            {status}
          </Badge>
        </span>
      }
      description="SSE frames emitted by the pipeline. Reconnecting replays the log from the start, so nothing is lost between page loads."
    >
      {ordered.length === 0 ? (
        <p className="text-xs text-zinc-500">No events recorded yet.</p>
      ) : (
        <ol className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {ordered.map((event) => (
            <li
              key={event.id}
              className="stream-in flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
            >
              <span className="font-mono text-[10px] text-zinc-500">#{String(event.seq).padStart(2, "0")}</span>
              <Badge tone={EVENT_TONE[event.type] ?? "zinc"} mono>
                {event.type}
              </Badge>
              <span className="min-w-0 flex-1 text-xs text-zinc-300">{event.summary}</span>
              <span className="font-mono text-[10px] text-zinc-600">{formatDateTime(event.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
