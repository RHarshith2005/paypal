import { formatUsd, type LedgerEntry } from "@handshake/shared";
import type { ColDef } from "ag-grid-community";
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
import { api } from "../lib/api";
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
    title: "Mutual handshake",
    body: "Buyer and merchant exchange single-use nonces and Ed25519 proofs bound to the deal. Each side verifies the other's key, attestation and transcript before any money moves.",
  },
  {
    step: "03",
    title: "Dual-signed receipt",
    body: "Both agents sign the settled offer, PayPal capture and the SHA-256 root of the message chain. Either side can later prove what was agreed, what was paid and that nothing was edited.",
  },
] as const;

export function OverviewPage() {
  const navigate = useNavigate();
  const health = useResource(() => api.health(), []);
  const mandates = useResource(() => api.mandates(), []);
  const ledger = useResource(() => api.ledger(), []);

  const entries = ledger.state.status === "success" ? ledger.state.data.entries : [];
  const settledTotal = entries
    .filter((entry) => entry.status === "SETTLED")
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const mandateList = mandates.state.status === "success" ? mandates.state.data.mandates : [];
  const activeMandates = mandateList.filter((view) => view.active).length;

  const columns: ColDef<LedgerEntry>[] = [
    {
      headerName: "Amount",
      valueGetter: (params) => (params.data ? formatUsd(params.data.amountMinor) : ""),
      width: 120,
    },
    {
      headerName: "Status",
      valueGetter: (params) => params.data?.status ?? "",
      cellRenderer: (params: { value?: string }) => (params.value ? <StatusPill status={params.value} /> : null),
      width: 130,
    },
    {
      headerName: "Deal",
      valueGetter: (params) => (params.data ? shortId(params.data.dealId, 14) : ""),
      flex: 1,
    },
    {
      headerName: "Recorded",
      valueGetter: (params) => (params.data ? formatDateTime(params.data.createdAt) : ""),
      width: 150,
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
          label="Ledger entries"
          value={ledger.state.status === "success" ? String(entries.length) : "—"}
          hint="reservations and settlements"
        />
        <Stat
          label="API round trip"
          value={health.state.status === "success" ? `${health.state.data.database.latencyMs} ms` : "—"}
          hint="database ping"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {PIPELINE.map((item) => (
          <Panel key={item.step} title={item.title} description={item.body}>
            <p className="font-mono text-[11px] tracking-[0.3em] text-emerald-300/70">STEP {item.step}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel
          title="Settlement ledger"
          description="Every reservation and settlement is written against the mandate that authorised it."
          actions={
            <LinkButton to="/ledger" tone="ghost">
              Open ledger
            </LinkButton>
          }
        >
          {ledger.state.status === "loading" && <LoadingPanel label="Loading ledger entries…" />}
          {ledger.state.status === "error" && <ErrorPanel message={ledger.state.error} onRetry={ledger.reload} />}
          {ledger.state.status === "success" &&
            (entries.length === 0 ? (
              <EmptyState
                title="Nothing settled yet"
                description="Once a deal clears its mandate check, handshake and PayPal capture, the reservation and settlement appear here."
              >
                <LinkButton to="/mandate" tone="ghost">
                  Inspect the mandate
                </LinkButton>
              </EmptyState>
            ) : (
              <DataGrid
                rows={entries.slice(0, 6)}
                columns={columns}
                height={Math.min(320, 44 + entries.slice(0, 6).length * 40)}
                onRowClicked={(entry) => navigate(`/deals/${entry.dealId}`)}
              />
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
  );
}
