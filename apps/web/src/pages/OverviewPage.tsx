import { formatUsd, type DealSummary } from "@handshake/shared";
import type { ColDef } from "ag-grid-community";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataGrid } from "../components/DataGrid";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  KeyValue,
  LinkButton,
  LoadingPanel,
  PageHeader,
  Panel,
  SimulatedTag,
  Stat,
  StatusPill,
} from "../components/ui";
import { api, ApiClientError } from "../lib/api";
import { formatDateTime, shortId } from "../lib/format";
import { useResource } from "../lib/useResource";

const PIPELINE = [
  {
    step: "01",
    title: "Signed mandate",
    body: "The human principal signs the spending envelope: lifetime budget, per-item cap, category and merchant allowlists, forbidden substitutions, transaction count and expiry. Every purchase is checked against it in code before a payment is created.",
  },
  {
    step: "02",
    title: "Trust anchor handshake",
    body: "A SIMULATED anchor issues short-lived attestations bound to the mandate hash and the catalog hash. Both sides verify signature, expiry, binding, revocation and a fresh nonce pair before a single price is discussed.",
  },
  {
    step: "03",
    title: "Dual-signed receipt",
    body: "Both agents sign the settled offer, the PayPal capture and the SHA-256 root of the hash-chained transcript. The arbiter later reads that packet, not anybody's summary of it.",
  },
] as const;

export function OverviewPage() {
  const navigate = useNavigate();
  const health = useResource(() => api.health(), []);
  const mandates = useResource(() => api.mandates(), []);
  const ledger = useResource(() => api.ledger(), []);
  const deals = useResource(() => api.deals(), []);
  const agents = useResource(() => api.agents(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const entries = ledger.state.status === "success" ? ledger.state.data.entries : [];
  const settledTotal = entries
    .filter((entry) => entry.status === "SETTLED")
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const mandateList = mandates.state.status === "success" ? mandates.state.data.mandates : [];
  const activeMandates = mandateList.filter((view) => view.active).length;
  const dealList = deals.state.status === "success" ? deals.state.data.deals : [];
  const trustRows = agents.state.status === "success" ? agents.state.data.agents : [];
  const caseA = mandateList.find((view) => view.mandate.id === "mnd_case_a");
  const caseB = mandateList.find((view) => view.mandate.id === "mnd_case_b");

  const runCase = async (caseLabel: "A" | "B") => {
    setBusy(`case-${caseLabel}`);
    setActionError(null);
    try {
      const run = await api.runDemo(caseLabel);
      navigate(`/deals/${run.dealId}`);
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : "Could not start the demo case.");
    } finally {
      setBusy(null);
    }
  };

  const resetDemo = async () => {
    setBusy("reset");
    setActionError(null);
    try {
      await api.resetDemo();
      mandates.reload();
      ledger.reload();
      deals.reload();
      agents.reload();
    } catch (error) {
      setActionError(error instanceof ApiClientError ? error.message : "Could not reset the demo data.");
    } finally {
      setBusy(null);
    }
  };

  const columns: ColDef<DealSummary>[] = [
    {
      headerName: "Deal",
      valueGetter: (params) => (params.data ? shortId(params.data.id, 18) : ""),
      width: 190,
    },
    {
      headerName: "Status",
      valueGetter: (params) => params.data?.status ?? "",
      cellRenderer: (params: { value?: string }) => (params.value ? <StatusPill status={params.value} /> : null),
      width: 160,
    },
    {
      headerName: "Amount",
      valueGetter: (params) => (params.data ? formatUsd(params.data.amountMinor) : ""),
      width: 110,
    },
    {
      headerName: "Signatures",
      valueGetter: (params) => (params.data ? `${params.data.signatures}/2` : ""),
      width: 110,
    },
    {
      headerName: "Chain",
      valueGetter: (params) => (params.data?.chainValid === null ? "—" : params.data?.chainValid ? "valid" : "broken"),
      width: 100,
    },
    {
      headerName: "Opened",
      valueGetter: (params) => (params.data ? formatDateTime(params.data.createdAt) : ""),
      flex: 1,
      minWidth: 140,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Agent commerce, with receipts."
        description="Buyer and merchant agents negotiate and settle through PayPal — inside a mandate a human signed, with cryptographic proof of who agreed to what."
        actions={<LinkButton to="/mandate">View mandate</LinkButton>}
      />

      {health.state.status === "success" && (
        <div className="panel mb-6 grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="mono-label">PayPal</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-200">
              {health.state.data.paypal.mode === "sandbox" ? "Sandbox" : "Mock adapter"}
              {health.state.data.paypal.simulated && <SimulatedTag label="Simulated" />}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {health.state.data.paypal.configured ? "credentials loaded" : "no credentials configured"}
            </p>
          </div>
          <div>
            <p className="mono-label">Agents</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-200">
              {health.state.data.agents.runtime === "MODEL" ? "Anthropic model" : "Scripted negotiator"}
              {health.state.data.agents.runtime === "SIMULATED" && <SimulatedTag label="Simulated" />}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">{health.state.data.agents.model}</p>
          </div>
          <div>
            <p className="mono-label">Database</p>
            <p className="mt-1 text-sm text-zinc-200">
              {health.state.data.database.driver === "postgres" ? "Postgres" : "Embedded Postgres (PGlite)"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {health.state.data.database.ok ? `${health.state.data.database.latencyMs} ms round trip` : "unreachable"}
            </p>
          </div>
        </div>
      )}

      {health.state.status === "error" && (
        <div className="mb-6">
          <ErrorPanel message={health.state.error} onRetry={health.reload} />
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active mandates"
          value={mandates.state.status === "success" ? `${activeMandates} / ${mandateList.length}` : "—"}
          hint="signed by a human principal"
        />
        <Stat label="Settled volume" value={formatUsd(settledTotal)} hint="ledger entries in SETTLED state" />
        <Stat
          label="Deals"
          value={deals.state.status === "success" ? String(dealList.length) : "—"}
          hint="created since the database was seeded"
        />
        <Stat
          label="API round trip"
          value={health.state.status === "success" ? `${health.state.data.database.latencyMs} ms` : "—"}
          hint="database ping"
        />
      </div>

      {(caseA || caseB) && (
        <Panel
          className="mb-6"
          title="Run a demo case"
          description="Each run is a fresh deal: handshake, negotiation, PayPal capture, dual-signed receipt. Case B deliberately bypasses the guard so the failure mode is on the record."
          actions={<Badge tone="zinc">SIMULATED catalog · mock or sandbox payments</Badge>}
        >
          <div className="flex flex-wrap items-center gap-3">
            {caseA && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runCase("A")}
                className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
              >
                {busy === "case-A" ? "Running…" : "Run Case A — valid purchase"}
              </button>
            )}
            {caseB && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runCase("B")}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-50"
              >
                {busy === "case-B" ? "Running…" : "Run Case B — misconfigured agent"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void resetDemo()}
              className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {busy === "reset" ? "Resetting…" : "Reset demo data"}
            </button>
            <LinkButton to="/demo/script" tone="ghost">
              Recording script
            </LinkButton>
            <span className="text-[11px] text-zinc-500">
              Case B records a <code className="font-mono">DEMO-BYPASS-00</code> guard decision as ledger evidence.
            </span>
          </div>
          {actionError && <p className="mt-3 text-xs text-rose-200">{actionError}</p>}
        </Panel>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {PIPELINE.map((item) => (
          <Panel key={item.step} title={item.title} description={item.body}>
            <p className="font-mono text-[11px] tracking-[0.3em] text-emerald-300/70">STEP {item.step}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Panel
            title="Deals"
            description="Select a row to watch its handshake, guard decisions and receipt."
            actions={
              <LinkButton to="/ledger" tone="ghost">
                Open ledger
              </LinkButton>
            }
          >
            {deals.state.status === "loading" && <LoadingPanel label="Loading deals…" />}
            {deals.state.status === "error" && <ErrorPanel message={deals.state.error} onRetry={deals.reload} />}
            {deals.state.status === "success" &&
              (dealList.length === 0 ? (
                <EmptyState
                  title="No deals yet"
                  description="A deal is created when a buyer agent acts under a signed mandate. Run a demo case above, or start one through the API."
                />
              ) : (
                <DataGrid
                  rows={dealList}
                  columns={columns}
                  height={Math.min(360, 44 + dealList.length * 40)}
                  onRowClicked={(deal) => navigate(`/deals/${deal.id}`)}
                />
              ))}
          </Panel>

          <Panel
            title="Settlement ledger"
            description="Every reservation and settlement is written against the mandate that authorised it."
          >
            {ledger.state.status === "loading" && <LoadingPanel label="Loading ledger entries…" />}
            {ledger.state.status === "error" && <ErrorPanel message={ledger.state.error} onRetry={ledger.reload} />}
            {ledger.state.status === "success" &&
              (entries.length === 0 ? (
                <EmptyState
                  title="Nothing settled yet"
                  description="A deal reserves funds before it creates a PayPal order and settles them after the capture."
                />
              ) : (
                <ul className="space-y-2">
                  {entries.slice(0, 6).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                    >
                      <StatusPill status={entry.status} />
                      <span className="font-mono text-xs text-zinc-200">{formatUsd(entry.amountMinor)}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/deals/${entry.dealId}`)}
                        className="ml-auto font-mono text-[11px] text-emerald-200 hover:text-emerald-100"
                      >
                        {shortId(entry.dealId, 18)} →
                      </button>
                      <span className="font-mono text-[10px] text-zinc-600">{formatDateTime(entry.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Trust scores"
            description="Fixed deltas, capped positive and negative contributions. The score is always recomputable from the event list."
          >
            {agents.state.status === "loading" && <LoadingPanel label="Loading trust events…" />}
            {agents.state.status === "error" && <ErrorPanel message={agents.state.error} onRetry={agents.reload} />}
            {agents.state.status === "success" && trustRows.length === 0 && (
              <p className="text-xs text-zinc-500">No agents have recorded events yet.</p>
            )}
            {trustRows.map((agent) => (
              <div key={agent.agentId} className="mb-4 rounded-lg border border-white/6 bg-white/[0.02] p-3 last:mb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-200">{agent.displayName}</p>
                  <Badge tone={agent.grade === "HIGH" ? "emerald" : agent.grade === "MEDIUM" ? "sky" : "rose"} mono>
                    {agent.score} · {agent.grade}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  clamp({agent.formula.base} + min({agent.positive}, {agent.formula.positiveCap}) + max(
                  {agent.negative}, -{agent.formula.negativeCap}), 0, 100)
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {agent.events.length === 0 ? (
                    <span className="text-[11px] text-zinc-500">no events</span>
                  ) : (
                    Object.entries(
                      agent.events.reduce<Record<string, number>>((counts, event) => {
                        counts[event.type] = (counts[event.type] ?? 0) + 1;
                        return counts;
                      }, {}),
                    ).map(([type, count]) => (
                      <Badge key={type} tone="zinc" mono>
                        {type} ×{count}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="What the principal controls" description="Terms the buyer agent cannot renegotiate.">
            <dl>
              <KeyValue label="Budget">Lifetime total, enforced in minor units</KeyValue>
              <KeyValue label="Per item">Hard cap per cart line</KeyValue>
              <KeyValue label="Counterparties">Merchant allowlist, or any merchant</KeyValue>
              <KeyValue label="Items">Category allowlist and forbidden substitutions</KeyValue>
              <KeyValue label="Runway">Transaction count and expiry</KeyValue>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="emerald">Deterministic</Badge>
              <Badge tone="zinc">Ed25519 signed</Badge>
              <Badge tone="zinc">Auditable</Badge>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
