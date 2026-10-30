import { formatUsd } from "@handshake/shared";
import { Link, useParams } from "react-router-dom";
import {
  Badge,
  CopyableId,
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
import { formatDateTime } from "../lib/format";
import { useResource } from "../lib/useResource";

export function DisputePage() {
  const { disputeId } = useParams<{ disputeId: string }>();
  const resource = useResource(() => api.dispute(disputeId ?? ""), [disputeId]);

  if (resource.state.status === "loading") {
    return <LoadingPanel label="Loading dispute…" />;
  }

  if (resource.state.status === "not-found") {
    return (
      <Panel>
        <EmptyState
          title="No dispute with that id"
          description={`The API has no dispute ${disputeId ?? ""}. Disputes are opened from a settled deal and appear on that deal's page.`}
        >
          <LinkButton to="/ledger" tone="ghost">
            Open ledger
          </LinkButton>
        </EmptyState>
      </Panel>
    );
  }

  if (resource.state.status === "error") {
    return <ErrorPanel message={resource.state.error} onRetry={resource.reload} />;
  }

  const dispute = resource.state.data;
  const ruling = dispute.ruling;
  const liabilityTone =
    ruling?.liability === "MERCHANT" ? "rose" : ruling?.liability === "UNRESOLVED" ? "amber" : "sky";

  return (
    <div>
      <PageHeader
        eyebrow="Arbitration"
        title={dispute.id}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={dispute.status} />
            <Badge tone="zinc">{dispute.claimType.replaceAll("_", " ")}</Badge>
            <span className="text-zinc-500">opened {formatDateTime(dispute.createdAt)}</span>
          </span>
        }
        actions={
          <LinkButton to={`/deals/${dispute.dealId}`} tone="ghost">
            Open deal
          </LinkButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
        <Panel title="Claim" description={`Filed by the ${dispute.openedBy.toLowerCase()}.`}>
          <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">{dispute.claim}</p>
          <dl className="mt-4">
            <KeyValue label="Deal">
              <Link to={`/deals/${dispute.dealId}`} className="text-emerald-200 hover:text-emerald-100">
                {dispute.dealId}
              </Link>
            </KeyValue>
            <KeyValue label="Dispute">
              <CopyableId value={dispute.id} />
            </KeyValue>
          </dl>
          <div className="mt-4">
            <p className="mono-label mb-2">Evidence referenced</p>
            <div className="flex flex-wrap gap-1.5">
              {dispute.evidenceIds.map((id) => (
                <code key={id} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                  {id}
                </code>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Ruling"
          description="Liability comes from deterministic rules. The narrative only explains the rule and may cite existing evidence ids."
        >
          {!ruling ? (
            <EmptyState
              title="Awaiting ruling"
              description="The arbiter evaluates the evidence packet against the liability rules, then writes a rationale that cites the evidence it used."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={liabilityTone} mono>
                  Liability: {ruling.liability}
                </Badge>
                <Badge tone={ruling.remedy === "NO_ACTION" ? "zinc" : "emerald"} mono>
                  {ruling.remedy.replaceAll("_", " ")}
                </Badge>
                {ruling.refundMinor > 0 && <Badge tone="emerald">{formatUsd(ruling.refundMinor)} refund</Badge>}
                <Badge tone="zinc" mono>
                  {ruling.narrativeSource === "MODEL" ? "model narrative" : "SIMULATED narrative"}
                </Badge>
              </div>

              <div className="mt-4 rounded-lg border border-white/6 bg-white/[0.02] p-4">
                <p className="mono-label">{ruling.ruleId}</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{ruling.ruleSummary}</p>
                <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-zinc-300">{ruling.narrative}</p>
              </div>

              <dl className="mt-4">
                <KeyValue label="Decided">{formatDateTime(ruling.decidedAt)}</KeyValue>
                <KeyValue label="Ruling">{ruling.id}</KeyValue>
              </dl>

              <div className="mt-3">
                <p className="mono-label mb-2">Citations</p>
                <div className="flex flex-wrap gap-1.5">
                  {ruling.citations.map((citation) => (
                    <code
                      key={citation}
                      className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400"
                    >
                      {citation}
                    </code>
                  ))}
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
