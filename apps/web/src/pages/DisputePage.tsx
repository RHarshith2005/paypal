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
  SimulatedTag,
  StatusPill,
} from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, shortHash } from "../lib/format";
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

  const { dispute, packet } = resource.state.data;
  const ruling = dispute.ruling;
  const liabilityTone =
    ruling?.liability === "MERCHANT" ? "rose" : ruling?.liability === "UNRESOLVED" ? "amber" : "sky";
  const verdictTone =
    ruling?.verdict === "MERCHANT_FAULT"
      ? "rose"
      : ruling?.verdict === "BUYER_AGENT_OUT_OF_MANDATE"
        ? "amber"
        : ruling?.verdict === "VALID_PURCHASE"
          ? "emerald"
          : "sky";

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
        <div className="space-y-6">
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
              {ruling && <KeyValue label="Decided">{formatDateTime(ruling.decidedAt)}</KeyValue>}
            </dl>
          </Panel>

          <Panel
            title="Deterministic checks"
            description="Signature, chain, mandate and fulfilment checks run before any model is consulted."
          >
            {!packet ? (
              <p className="text-xs text-zinc-500">No evidence packet is stored for this dispute.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {packet.checks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-xs">
                      <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                        {check.passed ? "✓" : "✕"}
                      </span>
                      <span className="text-zinc-300">{check.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-500">{check.id}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <p className="mono-label mb-2">Evidence ids in the packet</p>
                  <div className="flex flex-wrap gap-1.5">
                    {packet.evidenceIds.map((id) => (
                      <code key={id} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                        {id}
                      </code>
                    ))}
                  </div>
                </div>
                <dl className="mt-4">
                  <KeyValue label="Handshake">
                    {packet.handshake ? (
                      <span className="inline-flex items-center gap-2">
                        {packet.handshake.ok ? "verified" : "rejected"}
                        <SimulatedTag label="SIMULATED attestations" />
                      </span>
                    ) : (
                      "not recorded"
                    )}
                  </KeyValue>
                  <KeyValue label="Capture">
                    {formatUsd(packet.payment.amountMinor)} ·{" "}
                    {packet.payment.simulated ? "simulated" : "PayPal sandbox"}
                  </KeyValue>
                  <KeyValue label="Transcript root">
                    <code className="font-mono text-[11px]">
                      {shortHash(packet.transcript.at(-1)?.payloadHash ?? "GENESIS", 24)}
                    </code>
                  </KeyValue>
                </dl>
              </>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Ruling"
            description="Liability comes from deterministic rules. A model may only explain the ambiguity and cite evidence ids that exist in the packet."
          >
            {!ruling ? (
              <EmptyState
                title="Awaiting ruling"
                description="The arbiter evaluates the evidence packet against the liability rules, then writes a rationale that cites the evidence it used."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {ruling.verdict && (
                    <Badge tone={verdictTone} mono>
                      {ruling.verdict}
                    </Badge>
                  )}
                  <Badge tone={liabilityTone} mono>
                    Liability: {ruling.liability}
                  </Badge>
                  <Badge tone={ruling.remedy === "NO_ACTION" ? "zinc" : "emerald"} mono>
                    {ruling.remedy.replaceAll("_", " ")}
                  </Badge>
                  {ruling.refundMinor > 0 && <Badge tone="emerald">{formatUsd(ruling.refundMinor)} refund</Badge>}
                  <Badge tone={ruling.decidedBy === "MODEL_ASSISTED" ? "sky" : "zinc"} mono>
                    {ruling.decidedBy === "MODEL_ASSISTED" ? "model-assisted" : "deterministic"}
                  </Badge>
                  {ruling.confidence !== null && (
                    <Badge tone="zinc" mono>
                      confidence {ruling.confidence.toFixed(2)}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-white/6 bg-white/[0.02] p-4">
                  <p className="mono-label">{ruling.ruleId}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{ruling.ruleSummary}</p>
                  <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-zinc-300">{ruling.narrative}</p>
                </div>

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

                {ruling.rejectedModelOutput && (
                  <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
                    <p className="mono-label text-amber-200/80">Rejected model output</p>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-amber-100/70">
                      {ruling.rejectedModelOutput}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-200/80">
                      It cited evidence that is not in the packet or contradicted the deterministic liability, so the
                      deterministic ruling stands.
                    </p>
                  </div>
                )}
              </>
            )}
          </Panel>

          {ruling && (
            <Panel
              title="Merchant dispute response"
              description="Ready to paste into the PayPal dispute thread. Templated from the decided facts, not written by a model."
              actions={
                <Badge tone="zinc" mono>
                  draft
                </Badge>
              }
            >
              <pre className="whitespace-pre-wrap rounded-lg border border-white/6 bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
                {ruling.draftResponse}
              </pre>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
