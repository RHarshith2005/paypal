import {
  auditDealEvidence,
  formatUsd,
  type DealView,
  type EvidenceEntry,
  type GuardDecision,
  type NegotiationTurn,
  type ReceiptAudit,
  type DealReceipt,
} from "@handshake/shared";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DealEventStream } from "../components/DealEventStream";
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
  SimulatedTag,
  StatusPill,
} from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, shortHash } from "../lib/format";
import { useDealEvents } from "../lib/useDealEvents";
import { useResource } from "../lib/useResource";

export function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const resource = useResource(() => api.deal(dealId ?? ""), [dealId]);

  if (resource.state.status === "loading") {
    return <LoadingPanel label="Loading deal evidence…" />;
  }

  if (resource.state.status === "not-found") {
    return (
      <Panel>
        <EmptyState
          title="No deal with that id"
          description={`The API has no deal ${dealId ?? ""}. Deal ids are issued when a negotiation starts and appear in the ledger.`}
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

  return <DealDetail initial={resource.state.data} />;
}

interface Round {
  merchant: NegotiationTurn | undefined;
  buyer: NegotiationTurn | undefined;
  guard: GuardDecision | undefined;
}

function DealDetail({ initial }: { initial: DealView }) {
  const { events, status, revision } = useDealEvents(initial.deal.id, initial.deal.events);
  const latest = useResource(() => api.deal(initial.deal.id), [revision]);
  const view = latest.state.status === "success" ? latest.state.data : initial;
  const { deal, disputes } = view;

  const rounds = useMemo<Round[]>(() => {
    const merchants = deal.turns.filter((turn) => turn.from === "MERCHANT_AGENT");
    const buyers = deal.turns.filter((turn) => turn.from === "BUYER_AGENT");
    const count = Math.max(merchants.length, buyers.length);
    return Array.from({ length: count }, (_, index) => ({
      merchant: merchants[index],
      buyer: buyers[index],
      guard: deal.guardDecisions[index],
    }));
  }, [deal.turns, deal.guardDecisions]);

  const amountMinor = deal.agreedOffer?.totalMinor ?? deal.payment?.amountMinor ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Deal evidence"
        title={deal.id}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={deal.status} />
            <Badge tone="zinc" mono>
              {formatUsd(amountMinor)}
            </Badge>
            <span className="text-zinc-500">opened {formatDateTime(deal.createdAt)}</span>
          </span>
        }
        actions={
          <LinkButton to="/ledger" tone="ghost">
            Back to ledger
          </LinkButton>
        }
      />

      {deal.misconfiguredAgent && (
        <div className="mb-6">
          <Callout tone="amber" title={<>Demo misconfiguration <SimulatedTag label="Guard bypassed" /></>}>
            This deal ran with the MandateGuard deliberately bypassed, reproducing Case B. The bypass is written to the
            transcript as <code className="font-mono">DEMO-BYPASS-00</code>, and every limit it skipped is listed in the
            guard decisions beside the negotiation.
          </Callout>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel
          title="Negotiation"
          description="Buyer on the left, merchant on the right. Every merchant message is untrusted data; the guard decision under each buyer turn is what actually authorised a move."
          actions={
            <Badge tone="zinc" mono>
              {rounds.length} round{rounds.length === 1 ? "" : "s"}
            </Badge>
          }
        >
          {rounds.length === 0 ? (
            <EmptyState
              title="No negotiation turns"
              description="Turns are appended once the handshake succeeds. If the deal stopped earlier, the failure is recorded below."
            />
          ) : (
            <ol className="space-y-5">
              {rounds.map((round, index) => (
                <li key={index} className="space-y-2">
                  <p className="mono-label">Round {index + 1}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      {round.buyer ? (
                        <div
                          className="stream-in rounded-xl rounded-bl-sm border border-emerald-400/20 bg-emerald-400/[0.06] p-3"
                          style={{ animationDelay: `${index * 70}ms` }}
                        >
                          <p className="mono-label text-emerald-200/80">Buyer agent</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-200">{round.buyer.message}</p>
                          <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                            {round.buyer.kind} · {round.buyer.provenance === "MODEL" ? "model-authored" : "SIMULATED script"}
                          </p>
                        </div>
                      ) : (
                        <div className="h-full rounded-xl border border-dashed border-white/8 p-3 text-[11px] text-zinc-600">
                          no buyer turn
                        </div>
                      )}
                    </div>
                    <div>
                      {round.merchant ? (
                        <div
                          className="stream-in rounded-xl rounded-br-sm border border-sky-400/20 bg-sky-400/[0.05] p-3"
                          style={{ animationDelay: `${index * 70 + 40}ms` }}
                        >
                          <p className="mono-label text-sky-200/80">Merchant agent</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-200">{round.merchant.message}</p>
                          <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                            {round.merchant.offer ? `${formatUsd(round.merchant.offer.totalMinor)} quote` : "no quote"} ·{" "}
                            <span className="text-amber-200/70">untrusted input</span>
                          </p>
                        </div>
                      ) : (
                        <div className="h-full rounded-xl border border-dashed border-white/8 p-3 text-[11px] text-zinc-600">
                          no merchant turn
                        </div>
                      )}
                    </div>
                  </div>

                  {round.guard && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-[11px] ${
                        round.guard.bypassed
                          ? "border-amber-400/30 bg-amber-400/5"
                          : round.guard.allowed
                            ? "border-white/8 bg-white/[0.02]"
                            : "border-rose-400/25 bg-rose-400/5"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={round.guard.bypassed ? "amber" : round.guard.allowed ? "emerald" : "rose"} mono>
                          {round.guard.bypassed ? "BYPASSED" : round.guard.allowed ? "ALLOW" : "DENY"} ·{" "}
                          {round.guard.ruleId}
                        </Badge>
                        <span className="font-mono text-[10px] text-zinc-400">{round.guard.tool}</span>
                        <span className="ml-auto font-mono text-[10px] text-zinc-500">
                          {formatUsd(round.guard.offerTotalMinor)}
                        </span>
                      </div>
                      <p className="mt-1 leading-relaxed text-zinc-300">{round.guard.summary}</p>
                      {round.guard.bypassed && round.guard.bypassLabel && (
                        <p className="mt-1 font-mono text-[10px] text-amber-200/80">{round.guard.bypassLabel}</p>
                      )}
                      {round.guard.reasonCodes.length > 0 && (
                        <p className="mt-1 font-mono text-[10px] text-zinc-500">
                          {round.guard.reasonCodes.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Handshake"
            description="Mutual attestations from a local SIMULATED anchor, a fresh nonce pair, and a binding check against the mandate and catalog hashes."
          >
            {deal.handshakeResult ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={deal.handshakeResult.ok ? "emerald" : "rose"} mono>
                    {deal.handshakeResult.ok ? "ACCEPTED" : "REJECTED"}
                  </Badge>
                  <SimulatedTag label="SIMULATED attestations" />
                </div>
                <div className="mt-4 flex items-center gap-1">
                  {deal.handshake.map((message, index) => (
                    <div key={`${message.type}-${index}`} className="flex flex-1 items-center gap-1">
                      <div className="flex-1 rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5 text-center">
                        <p className="font-mono text-[10px] text-emerald-300/80">{message.type}</p>
                        <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-500" title={message.nonce}>
                          {shortHash(message.nonce, 10)}
                        </p>
                      </div>
                      {index < deal.handshake.length - 1 && (
                        <span className="chain-link font-mono text-xs text-emerald-300">↔</span>
                      )}
                    </div>
                  ))}
                </div>
                <dl className="mt-3">
                  <KeyValue label="Session">
                    <code className="font-mono text-[11px]">{shortHash(deal.handshakeResult.sessionId, 20)}</code>
                  </KeyValue>
                  <KeyValue label="Mandate hash">
                    <code className="font-mono text-[11px]">{shortHash(deal.handshakeResult.mandateHash, 18)}</code>
                  </KeyValue>
                  <KeyValue label="Catalog hash">
                    <code className="font-mono text-[11px]">{shortHash(deal.handshakeResult.catalogHash, 18)}</code>
                  </KeyValue>
                  <KeyValue label="Checks passed">
                    {deal.handshakeResult.checks.filter((check) => check.passed).length} /{" "}
                    {deal.handshakeResult.checks.length}
                  </KeyValue>
                </dl>
                <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1">
                  {deal.handshakeResult.checks.map((check) => (
                    <li key={check.code} className="flex items-start gap-2 text-[11px]">
                      <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                        {check.passed ? "✓" : "✕"}
                      </span>
                      <span className="text-zinc-300">{check.name}</span>
                      <span className="ml-auto font-mono text-[9px] text-zinc-600">{check.code}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                title="No handshake yet"
                description="The handshake runs before negotiation. A rejected handshake stops the deal with the failing check recorded."
              />
            )}
          </Panel>

          <Panel title="Payment" description="Settled through the PayPal adapter after the mandate check passes.">
            {deal.payment ? (
              <>
                <dl>
                  <KeyValue label="Adapter">
                    <span className="inline-flex items-center gap-2">
                      {deal.payment.provider === "PAYPAL_MOCK" ? "PayPal mock" : "PayPal sandbox"}
                      {deal.payment.simulated && <SimulatedTag label="Simulated" />}
                    </span>
                  </KeyValue>
                  <KeyValue label="Status">
                    <StatusPill status={deal.payment.status} />
                  </KeyValue>
                  <KeyValue label="Amount">{formatUsd(deal.payment.amountMinor)}</KeyValue>
                  <KeyValue label="Order id">
                    <code className="font-mono text-[11px]">{deal.payment.orderId}</code>
                  </KeyValue>
                  <KeyValue label="Capture id">
                    <code className="font-mono text-[11px]">{deal.payment.captureId ?? "not captured"}</code>
                  </KeyValue>
                  <KeyValue label="Captured">
                    {deal.payment.capturedAt ? formatDateTime(deal.payment.capturedAt) : "—"}
                  </KeyValue>
                </dl>
                {deal.payment.failureReason && (
                  <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/5 p-3 text-xs text-rose-200">
                    {deal.payment.failureReason}
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                title="No payment yet"
                description="A payment is created only after agreement and a passing mandate check."
              />
            )}
          </Panel>

          {deal.failure && (
            <Callout tone="rose" title={deal.failure.ruleId}>
              {deal.failure.message}
            </Callout>
          )}

          <Panel title="Disputes" description="Claims filed against this deal.">
            {disputes.length === 0 ? (
              <p className="text-xs text-zinc-500">No dispute has been filed.</p>
            ) : (
              <ul className="space-y-2">
                {disputes.map((dispute) => (
                  <li
                    key={dispute.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                  >
                    <div>
                      <p className="font-mono text-[11px] text-zinc-400">{dispute.id}</p>
                      <p className="mt-0.5 text-xs text-zinc-300">{dispute.claimType.replaceAll("_", " ")}</p>
                    </div>
                    <Link to={`/disputes/${dispute.id}`} className="text-xs text-emerald-200 hover:text-emerald-100">
                      Open →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <ReceiptPanel receipt={deal.receipt} transcript={deal.transcript} />
      </div>

      {deal.injectionSignals.length > 0 && (
        <div className="mt-6">
          <Panel
            title={
              <span className="flex flex-wrap items-center gap-2">
                Blocked injection attempts <Badge tone="amber">{deal.injectionSignals.length}</Badge>
              </span>
            }
            description="Counterparty text is data. These signals were recorded and never executed as instructions."
          >
            <ul className="grid gap-2 sm:grid-cols-2">
              {deal.injectionSignals.map((signal) => (
                <li
                  key={`${signal.at}-${signal.pattern}-${signal.excerpt.slice(0, 12)}`}
                  className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2"
                >
                  <p className="font-mono text-[10px] text-amber-200/80">{signal.pattern}</p>
                  <p className="mt-1 text-xs text-zinc-300">“{signal.excerpt}”</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <DealEventStream events={events} status={status} />
        <Panel
          title="Evidence chain"
          description="Each entry hashes its predecessor. Verify with the button above, or flip a byte on the ledger page to see the exact broken entry."
        >
          {deal.transcript.length === 0 ? (
            <EmptyState title="No transcript" description="Handshake and negotiation messages appear here as they run." />
          ) : (
            <ol className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {deal.transcript.map((entry) => (
                <li
                  key={`${entry.seq}-${entry.payloadHash}`}
                  className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-emerald-300/80">
                      #{String(entry.seq).padStart(2, "0")} {entry.type}
                    </span>
                    <code className="font-mono text-[10px] text-zinc-500">{shortHash(entry.payloadHash, 20)}</code>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400">{entry.signer}</span>
                    <span className="font-mono text-[10px] text-zinc-600">prev {shortHash(entry.prevHash, 14)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ReceiptPanel({ receipt, transcript }: { receipt: DealReceipt | null; transcript: EvidenceEntry[] }) {
  const [audit, setAudit] = useState<ReceiptAudit | null>(null);

  if (!receipt) {
    return (
      <Panel
        title="Dual-signed receipt"
        description="Both agents sign the agreed cart, the PayPal order and the transcript root."
      >
        <EmptyState
          title="Receipt not issued"
          description="Both agents sign only after the capture completes. Without a receipt there is no evidence packet to arbitrate."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          Dual-signed receipt
          {audit && (
            <span className={audit.ok ? "verify-pop inline-flex" : "inline-flex"}>
              <Badge tone={audit.ok ? "emerald" : "rose"} mono>
                {audit.ok ? "VERIFIED" : "BROKEN"}
              </Badge>
            </span>
          )}
        </span>
      }
      description="Buyer and merchant signatures cover the same canonical receipt body. The Verify button recomputes the whole hash chain in your browser."
      actions={
        <Button onClick={() => setAudit(auditDealEvidence(receipt, transcript))}>Verify in browser</Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <dl>
            <KeyValue label="Receipt">{receipt.id}</KeyValue>
            <KeyValue label="Issued">{formatDateTime(receipt.issuedAt)}</KeyValue>
            <KeyValue label="Digest">
              <code className="font-mono text-[11px]">{shortHash(receipt.digest, 28)}</code>
            </KeyValue>
            <KeyValue label="Agreed price">
              {formatUsd(receipt.agreedPrice.amountMinor)} {receipt.agreedPrice.currency}
            </KeyValue>
            <KeyValue label="Transcript root">
              <code className="font-mono text-[11px]">{shortHash(receipt.negotiationTranscriptHash, 28)}</code>
            </KeyValue>
            <KeyValue label="PayPal order">
              <code className="font-mono text-[11px]">{receipt.paypalOrderId}</code>
            </KeyValue>
          </dl>
          <table className="mt-4 w-full text-left text-xs">
            <thead>
              <tr className="mono-label border-b border-white/8">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {receipt.cart.map((item) => (
                <tr key={item.sku} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 text-zinc-200">
                    {item.name} <span className="ml-1 font-mono text-[10px] text-zinc-500">{item.sku}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-zinc-300">{item.quantity}</td>
                  <td className="py-1.5 text-right font-mono text-zinc-300">{formatUsd(item.unitPriceMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-white/8 bg-black/25 p-3">
            <p className="mono-label">Buyer signature</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-300">
              {receipt.buyerSignature.signature.keyId} · {shortHash(receipt.buyerSignature.signature.value, 22)}
            </p>
            <p className="mono-label mt-3">Merchant signature</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-300">
              {receipt.merchantSignature.signature.keyId} · {shortHash(receipt.merchantSignature.signature.value, 22)}
            </p>
            <p className="mono-label mt-3">Attestations</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400">
              {receipt.attestationRefs.buyer} · {receipt.attestationRefs.merchant}
            </p>
          </div>

          {audit ? (
            <div
              className={`rounded-lg border p-3 text-[11px] ${
                audit.ok ? "border-emerald-400/30 bg-emerald-400/5" : "border-rose-400/30 bg-rose-400/5"
              }`}
              role="status"
            >
              <p className={`font-medium ${audit.ok ? "text-emerald-100" : "text-rose-100"}`}>
                {audit.ok
                  ? "Chain and receipt digest agree."
                  : audit.chain.valid
                    ? "Chain is intact, but the receipt body no longer matches its digest."
                    : `Chain broken: ${audit.chain.reason ?? "unknown"}`}
              </p>
              <dl className="mt-2 space-y-1 font-mono text-[10px] text-zinc-400">
                <div className="flex justify-between gap-3">
                  <dt>entries verified</dt>
                  <dd>{transcript.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>chain root</dt>
                  <dd>{shortHash(audit.chain.root, 24)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>receipt digest</dt>
                  <dd>{audit.digestMatches ? "matches body" : "does not match"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>first break</dt>
                  <dd>{audit.chain.brokenAt === null ? "none" : `entry #${audit.chain.brokenAt}`}</dd>
                </div>
              </dl>
              <p className="mt-2 leading-relaxed text-zinc-500">
                Ed25519 signatures were verified by the API at issue time; this browser check re-derives SHA-256 hashes
                only.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 p-3 text-[11px] leading-relaxed text-zinc-500">
              Nothing checked yet. Verification runs locally over the transcript and receipt body — no server call, so
              the result is reproducible offline.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
