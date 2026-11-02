import { formatUsd, type DisputeListItem } from "@handshake/shared";
import { Link } from "react-router-dom";
import {
  Badge,
  Callout,
  EmptyState,
  ErrorPanel,
  KeyValue,
  LinkButton,
  LoadingPanel,
  Meter,
  PageHeader,
  Panel,
  SimulatedTag,
  StatusPill,
} from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, shortHash } from "../lib/format";
import { useResource } from "../lib/useResource";

const VERDICT_TONE = {
  MERCHANT_FAULT: "rose",
  BUYER_AGENT_OUT_OF_MANDATE: "amber",
  VALID_PURCHASE: "emerald",
  AMBIGUOUS_INTENT: "sky",
} as const;

export function DisputeCourtPage() {
  const court = useResource(() => api.disputes(), []);
  const items = court.state.status === "success" ? court.state.data.disputes : [];
  const caseA = items.find((item) => item.caseLabel === "A");
  const caseB = items.find((item) => item.caseLabel === "B");
  const other = items.filter((item) => item.caseLabel === null);

  return (
    <div>
      <PageHeader
        eyebrow="Dispute court"
        title="Two cases, one rulebook."
        description="Deterministic checks decide first. A model may only explain an ambiguity and cite evidence that exists in the packet — and its answer is discarded if it does not."
        actions={
          <LinkButton to="/ledger" tone="ghost">
            Evidence ledger
          </LinkButton>
        }
      />

      {court.state.status === "loading" && <LoadingPanel label="Loading disputes…" />}
      {court.state.status === "error" && <ErrorPanel message={court.state.error} onRetry={court.reload} />}

      {court.state.status === "success" && items.length === 0 && (
        <EmptyState
          title="No disputes on file"
          description="Open a demo case from the overview. Each run produces a dispute, and the court compares them side by side."
        />
      )}

      {(caseA || caseB) && (
        <div className="grid gap-6 xl:grid-cols-2">
          <CaseCard label="A" item={caseA} fallback="Case A — valid purchase, claim defeated by delivery proof" />
          <CaseCard label="B" item={caseB} fallback="Case B — misconfigured agent exceeded its signed mandate" />
        </div>
      )}

      {other.length > 0 && (
        <div className="mt-6">
          <Panel title="Other disputes" description="Cases opened outside the seeded pair.">
            <ul className="space-y-2">
              {other.map((item) => (
                <li
                  key={item.dispute.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                >
                  <Badge tone="zinc" mono>
                    {item.dispute.claimType.replaceAll("_", " ")}
                  </Badge>
                  <StatusPill status={item.dispute.status} />
                  <Link
                    to={`/disputes/${item.dispute.id}`}
                    className="ml-auto text-xs text-emerald-200 hover:text-emerald-100"
                  >
                    Open ruling →
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

function CaseCard({
  label,
  item,
  fallback,
}: {
  label: "A" | "B";
  item: DisputeListItem | undefined;
  fallback: string;
}) {
  if (!item) {
    return (
      <Panel title={`Case ${label}`} description={fallback}>
        <EmptyState
          title="Case not seeded"
          description="This instance has no dispute for this case yet. Reset the demo on the overview to rebuild both cases."
        />
      </Panel>
    );
  }

  const { dispute, packet } = item;
  const ruling = dispute.ruling;
  const settled = packet?.payment.amountMinor ?? 0;
  const refundPercent = settled > 0 && ruling ? (ruling.refundMinor / settled) * 100 : 0;
  const failedChecks = packet?.checks.filter((check) => !check.passed) ?? [];

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          Case {label}
          {ruling?.verdict && (
            <Badge tone={VERDICT_TONE[ruling.verdict] ?? "zinc"} mono>
              {ruling.verdict}
            </Badge>
          )}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          {fallback}
          {packet?.payment.simulated && <SimulatedTag label="Simulated capture" />}
        </span>
      }
      actions={<StatusPill status={dispute.status} />}
    >
      <p className="text-xs leading-relaxed text-zinc-300">{dispute.claim}</p>

      <div className="mt-4 space-y-4">
        <Meter
          percent={refundPercent}
          tone={refundPercent >= 99 ? "emerald" : refundPercent > 0 ? "amber" : "sky"}
          label="Liability share refunded by the merchant"
          value={`${Math.round(refundPercent)}% · ${formatUsd(ruling?.refundMinor ?? 0)} of ${formatUsd(settled)}`}
        />

        {ruling ? (
          <>
            <div className="rounded-lg border border-white/8 bg-black/25 p-3">
              <p className="mono-label">{ruling.ruleId}</p>
              <p className="mt-1 text-xs font-medium text-zinc-100">{ruling.ruleSummary}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{ruling.narrative}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={ruling.decidedBy === "MODEL_ASSISTED" ? "sky" : "zinc"} mono>
                  {ruling.decidedBy === "MODEL_ASSISTED" ? "model-assisted" : "deterministic"}
                </Badge>
                <Badge tone="zinc" mono>
                  {ruling.liability}
                </Badge>
                <Badge tone={ruling.remedy === "NO_ACTION" ? "zinc" : "emerald"} mono>
                  {ruling.remedy.replaceAll("_", " ")}
                </Badge>
                <span className="font-mono text-[10px] text-zinc-600">
                  {ruling.decidedAt ? formatDateTime(ruling.decidedAt) : ""}
                </span>
              </p>
            </div>

            <div>
              <p className="mono-label">Evidence highlights</p>
              {failedChecks.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  All {packet?.checks.length ?? 0} deterministic checks passed.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {failedChecks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-[11px]">
                      <span className="text-rose-400">✕</span>
                      <span className="text-zinc-300">{check.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-600">{check.id}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ruling.citations.slice(0, 8).map((citation) => (
                  <code
                    key={citation}
                    className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                  >
                    {citation}
                  </code>
                ))}
              </div>
            </div>

            <details className="rounded-lg border border-white/8 bg-black/25">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-zinc-300">
                Drafted merchant response
              </summary>
              <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-zinc-400">
                {ruling.draftResponse}
              </pre>
            </details>

            <dl>
              <KeyValue label="Deal">
                <Link to={`/deals/${dispute.dealId}`} className="text-emerald-200 hover:text-emerald-100">
                  {shortHash(dispute.dealId, 22)}
                </Link>
              </KeyValue>
              <KeyValue label="Dispute">
                <Link to={`/disputes/${dispute.id}`} className="text-emerald-200 hover:text-emerald-100">
                  full ruling →
                </Link>
              </KeyValue>
              <KeyValue label="Transcript root">
                <code className="font-mono text-[11px]">
                  {shortHash(packet?.transcript.at(-1)?.payloadHash ?? "GENESIS", 24)}
                </code>
              </KeyValue>
            </dl>
          </>
        ) : (
          <Callout tone="amber" title="No ruling yet">
            The arbiter has not decided this dispute.
          </Callout>
        )}
      </div>
    </Panel>
  );
}
