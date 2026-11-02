import { formatUsd, tamperedTranscript, verifyChain, type DealSummary, type LedgerEntry } from "@handshake/shared";
import type { ColDef } from "ag-grid-community";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataGrid } from "../components/DataGrid";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  ErrorPanel,
  KeyValue,
  LinkButton,
  LoadingPanel,
  PageHeader,
  Panel,
  StatusPill,
} from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, shortHash } from "../lib/format";
import { useResource } from "../lib/useResource";

type Segment = "none" | "status" | "mandate";

const COLUMNS: ColDef<LedgerEntry>[] = [
  {
    headerName: "Entry",
    valueGetter: (params) => (params.data ? shortHash(params.data.id, 16) : ""),
    width: 190,
  },
  {
    headerName: "Amount",
    valueGetter: (params) => (params.data ? formatUsd(params.data.amountMinor) : ""),
    width: 120,
  },
  {
    headerName: "Status",
    valueGetter: (params) => params.data?.status ?? "",
    cellRenderer: (params: { value?: string }) => (params.value ? <StatusPill status={params.value} /> : null),
    width: 140,
  },
  {
    headerName: "Deal",
    valueGetter: (params) => (params.data ? shortHash(params.data.dealId, 18) : ""),
    flex: 1,
    minWidth: 200,
  },
  {
    headerName: "Mandate",
    valueGetter: (params) => (params.data ? shortHash(params.data.mandateId, 18) : ""),
    width: 200,
  },
  {
    headerName: "Recorded",
    valueGetter: (params) => (params.data ? formatDateTime(params.data.createdAt) : ""),
    width: 160,
  },
];

export function LedgerPage() {
  const navigate = useNavigate();
  const ledger = useResource(() => api.ledger(), []);
  const deals = useResource(() => api.deals(), []);
  const [segment, setSegment] = useState<Segment>("none");
  const [auditId, setAuditId] = useState<string | null>(null);

  const entries = useMemo(() => (ledger.state.status === "success" ? ledger.state.data.entries : []), [ledger.state]);
  const dealList = useMemo(() => (deals.state.status === "success" ? deals.state.data.deals : []), [deals.state]);

  const groups = useMemo(() => {
    if (segment === "none") return [{ key: "All entries", rows: entries }];
    const map = new Map<string, LedgerEntry[]>();
    for (const entry of entries) {
      const key = segment === "status" ? entry.status : shortHash(entry.mandateId, 24);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({ key, rows }));
  }, [entries, segment]);

  const audited = dealList.find((deal) => deal.id === auditId) ?? dealList[0];

  return (
    <div>
      <PageHeader
        eyebrow="Money movement"
        title="Settlement ledger"
        description="A reservation is written before a PayPal order exists and settled after the capture. Reserved funds count against the mandate, so two concurrent deals cannot overdraw one budget."
        actions={
          <LinkButton to="/mandate" tone="ghost">
            View mandate
          </LinkButton>
        }
      />

      <Panel
        title="Entries"
        description="Filter with the column headers, segmented by the control on the right. Select a row to open its deal."
        actions={
          <div className="flex items-center gap-2">
            <span className="mono-label">Segment by</span>
            <select
              className="field w-auto py-1 text-[11px]"
              value={segment}
              onChange={(event) => setSegment(event.target.value as Segment)}
              aria-label="Segment ledger rows"
            >
              <option value="none">none</option>
              <option value="status">status</option>
              <option value="mandate">mandate</option>
            </select>
          </div>
        }
      >
        {ledger.state.status === "loading" && <LoadingPanel label="Loading ledger entries…" />}
        {ledger.state.status === "error" && <ErrorPanel message={ledger.state.error} onRetry={ledger.reload} />}
        {ledger.state.status === "success" &&
          (entries.length === 0 ? (
            <EmptyState
              title="No ledger entries yet"
              description="A deal writes a RESERVED entry when it passes the mandate check, then moves it to SETTLED after the capture."
            />
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  {segment !== "none" && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="mono-label">{segment === "status" ? "status" : "mandate"}</span>
                      <span className="font-mono text-xs text-zinc-300">{group.key}</span>
                      <Badge tone="zinc">{group.rows.length}</Badge>
                    </div>
                  )}
                  <DataGrid
                    rows={group.rows}
                    columns={COLUMNS}
                    height={Math.min(420, 44 + group.rows.length * 40)}
                    onRowClicked={(entry) => navigate(`/deals/${entry.dealId}`)}
                  />
                </div>
              ))}
            </div>
          ))}
      </Panel>

      <div className="mt-6">
        <IntegrityPanel
          deals={dealList}
          audited={audited}
          loading={deals.state.status === "loading"}
          onSelect={setAuditId}
        />
      </div>
    </div>
  );
}

function IntegrityPanel({
  deals,
  audited,
  loading,
  onSelect,
}: {
  deals: DealSummary[];
  audited: DealSummary | undefined;
  loading: boolean;
  onSelect: (dealId: string) => void;
}) {
  const [tamperedIndex, setTamperedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const dealResource = useResource(() => api.deal(audited?.id ?? ""), [audited?.id]);
  const transcript = dealResource.state.status === "success" ? dealResource.state.data.deal.transcript : [];
  const chain = tamperedIndex === null ? transcript : tamperedTranscript(transcript, tamperedIndex);
  const verification = verifyChain(chain);

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          Evidence integrity
          <Badge tone={verification.valid ? "emerald" : "rose"} mono>
            {verification.valid ? "chain intact" : `broken at #${verification.brokenAt ?? "?"}`}
          </Badge>
        </span>
      }
      description="Append-only and hash-chained: an edit, a reorder or a deletion changes a hash a verifier recomputes. The tamper control flips one byte in local memory — stored evidence is untouched."
      actions={
        loading ? (
          <Badge tone="zinc">loading deals…</Badge>
        ) : (
          <select
            className="field w-auto py-1 text-[11px]"
            value={audited?.id ?? ""}
            onChange={(event) => {
              setTamperedIndex(null);
              setSelectedIndex(0);
              onSelect(event.target.value);
            }}
            aria-label="Choose a deal to audit"
          >
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {shortHash(deal.id, 22)} · {deal.status}
              </option>
            ))}
          </select>
        )
      }
    >
      {deals.length === 0 ? (
        <EmptyState
          title="No deal to audit"
          description="Run Case A or Case B from the overview; every deal writes a hash-chained transcript."
        />
      ) : dealResource.state.status === "error" ? (
        <ErrorPanel message={dealResource.state.error} onRetry={dealResource.reload} />
      ) : transcript.length === 0 ? (
        <LoadingPanel label="Loading transcript…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <div>
            <ol className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {chain.map((entry, index) => {
                const broken = verification.brokenAt === index;
                return (
                  <li key={`${entry.seq}-${index}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      aria-pressed={selectedIndex === index}
                      className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition ${
                        broken
                          ? "border-rose-400/50 bg-rose-400/10"
                          : selectedIndex === index
                            ? "border-emerald-400/40 bg-emerald-400/5"
                            : "border-white/6 bg-white/[0.02] hover:border-white/16"
                      }`}
                    >
                      <span className="font-mono text-zinc-500">#{String(entry.seq).padStart(2, "0")}</span>
                      <span className="font-mono text-emerald-300/80">{entry.type}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-500">
                        {shortHash(entry.payloadHash, 18)}
                      </span>
                      {broken && (
                        <span className="w-full font-mono text-[10px] text-rose-300">✕ {verification.reason}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-3">
            <Callout
              tone={verification.valid ? "emerald" : "rose"}
              title={
                verification.valid
                  ? "Every entry hashes to its predecessor"
                  : `First break: entry #${verification.brokenAt}`
              }
            >
              {verification.valid
                ? "The transcript root committed by the receipt still matches."
                : (verification.reason ?? "The chain does not verify.")}
            </Callout>

            <div className="flex flex-wrap gap-2">
              <Button tone="danger" onClick={() => setTamperedIndex(selectedIndex)} disabled={tamperedIndex !== null}>
                Flip one byte in #{selectedIndex}
              </Button>
              <Button tone="ghost" onClick={() => setTamperedIndex(null)} disabled={tamperedIndex === null}>
                Restore
              </Button>
            </div>

            <dl>
              <KeyValue label="Entries">{transcript.length}</KeyValue>
              <KeyValue label="Root">
                <code className="font-mono text-[11px]">{shortHash(verification.root, 26)}</code>
              </KeyValue>
              <KeyValue label="Tampered">{tamperedIndex === null ? "none" : `entry #${tamperedIndex}`}</KeyValue>
            </dl>

            <p className="text-[11px] leading-relaxed text-zinc-500">
              Verification runs in this browser: SHA-256 over canonical JSON, recomputed from the bytes on screen. No
              server call is made, so the same result holds offline.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
