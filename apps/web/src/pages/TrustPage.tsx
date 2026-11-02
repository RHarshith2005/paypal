import type { AgentTrust } from "@handshake/shared";
import { Badge, EmptyState, ErrorPanel, LoadingPanel, Meter, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";
import { shortHash } from "../lib/format";
import { useResource } from "../lib/useResource";

const GRADE_TONE = { HIGH: "emerald", MEDIUM: "sky", LOW: "rose" } as const;

export function TrustPage() {
  const agents = useResource(() => api.agents(), []);
  const rows = agents.state.status === "success" ? agents.state.data.agents : [];

  return (
    <div>
      <PageHeader
        eyebrow="Counterparty quality"
        title="Trust scoreboard"
        description="A score you can recompute. Fixed deltas per event, capped positive and negative contributions, clamped to 0–100 — no hidden model and no black box."
      />

      {agents.state.status === "loading" && <LoadingPanel label="Loading trust events…" />}
      {agents.state.status === "error" && <ErrorPanel message={agents.state.error} onRetry={agents.reload} />}

      {agents.state.status === "success" && rows.length === 0 && (
        <EmptyState
          title="No agents to score"
          description="Trust events are written when a deal settles, a receipt is signed, a payment fails or an injection is blocked."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((agent) => (
          <TrustCard key={agent.agentId} agent={agent} />
        ))}
      </div>

      <div className="mt-6">
        <Panel
          title="How a score is built"
          description="Every input is visible on the card. The same function runs in the API and in the tests."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mono-label">Formula</p>
              <pre className="mt-2 rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {`score = clamp(
  base
  + min(positive_events, positive_cap)
  + max(negative_events, -negative_cap),
  0, 100
)`}
              </pre>
            </div>
            <div>
              <p className="mono-label">Deltas</p>
              <ul className="mt-2 space-y-1 text-[11px]">
                {Object.entries(rows[0]?.formula.deltas ?? {}).map(([type, delta]) => (
                  <li
                    key={type}
                    className="flex justify-between gap-3 rounded border border-white/6 bg-white/[0.02] px-2 py-1"
                  >
                    <span className="font-mono text-zinc-400">{type}</span>
                    <span className={delta > 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-zinc-500">
                base {rows[0]?.formula.base ?? 50} · positive cap {rows[0]?.formula.positiveCap ?? 25} · negative cap{" "}
                {rows[0]?.formula.negativeCap ?? 40}
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TrustCard({ agent }: { agent: AgentTrust }) {
  const counts = agent.events.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.type] = (accumulator[event.type] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {agent.displayName}
          <Badge tone={GRADE_TONE[agent.grade]} mono>
            {agent.score} · {agent.grade}
          </Badge>
        </span>
      }
      description={
        <span className="font-mono text-[11px]">
          {agent.kind} · {shortHash(agent.agentId, 26)}
        </span>
      }
    >
      <Meter
        percent={agent.score}
        tone={agent.grade === "HIGH" ? "emerald" : agent.grade === "MEDIUM" ? "sky" : "rose"}
        label="Score"
        value={`${agent.score} / 100`}
      />
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        clamp({agent.formula.base} + min({agent.positive}, {agent.formula.positiveCap}) + max({agent.negative}, -
        {agent.formula.negativeCap}), 0, 100)
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {agent.events.length === 0 ? (
          <span className="text-[11px] text-zinc-500">no events yet</span>
        ) : (
          Object.entries(counts).map(([type, count]) => (
            <Badge
              key={type}
              tone={(agent.formula.deltas[type as keyof typeof agent.formula.deltas] ?? 0) > 0 ? "emerald" : "rose"}
              mono
            >
              {type} ×{count}
            </Badge>
          ))
        )}
      </div>

      {agent.events.length > 0 && (
        <details className="mt-3 rounded-lg border border-white/8 bg-black/25">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-zinc-300">
            Event log ({agent.events.length})
          </summary>
          <ul className="max-h-48 space-y-1 overflow-y-auto px-3 pb-3">
            {[...agent.events].reverse().map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex flex-wrap items-baseline gap-2 text-[10px]">
                <span className="font-mono text-zinc-500">{event.at.slice(11, 19)}</span>
                <span className="font-mono text-zinc-300">{event.type}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{event.note}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
