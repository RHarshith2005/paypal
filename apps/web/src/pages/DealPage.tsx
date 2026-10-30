import { formatUsd, offerLineTotal } from "@handshake/shared";
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
import { formatDateTime, shortHash, shortId } from "../lib/format";
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

  const { deal, disputes } = resource.state.data;
  const amountMinor = deal.agreedOffer?.totalMinor ?? deal.payment?.amountMinor ?? 0;
  const receipt = deal.receipt;

  return (
    <div>
      <PageHeader
        eyebrow="Deal evidence"
        title={shortId(deal.id, 22)}
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Counterparties" description="Both agents act under keys bound to the deal at handshake time.">
          <dl>
            <KeyValue label="Buyer agent">
              <CopyableId value={deal.buyerAgentId} />
            </KeyValue>
            <KeyValue label="Merchant agent">
              <CopyableId value={deal.merchantAgentId} />
            </KeyValue>
            <KeyValue label="Mandate">
              <CopyableId value={deal.mandateId} />
            </KeyValue>
            <KeyValue label="Handshake session">
              {deal.sessionId ? (
                <code className="font-mono text-[11px]">{shortHash(deal.sessionId, 24)}</code>
              ) : (
                "not established"
              )}
            </KeyValue>
            <KeyValue label="Completed">{deal.completedAt ? formatDateTime(deal.completedAt) : "—"}</KeyValue>
          </dl>
          {deal.failure && (
            <div className="mt-4 rounded-lg border border-rose-400/25 bg-rose-400/5 p-3">
              <p className="font-mono text-[11px] text-rose-300">{deal.failure.ruleId}</p>
              <p className="mt-1 text-xs text-rose-100/80">{deal.failure.message}</p>
            </div>
          )}
        </Panel>

        <Panel title="Payment" description="Settlement runs through the PayPal adapter after the mandate check.">
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
                  {deal.payment.captureId ? (
                    <code className="font-mono text-[11px]">{deal.payment.captureId}</code>
                  ) : (
                    "not captured"
                  )}
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
              description="A payment is created only after the buyer and merchant agree and the mandate check passes."
            />
          )}
        </Panel>

        <Panel
          title="Agreed offer"
          description="Line items parsed from the merchant's proposal and validated against the mandate."
        >
          {deal.agreedOffer ? (
            <>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="mono-label border-b border-white/8">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Unit</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.agreedOffer.items.map((item) => (
                    <tr key={item.sku} className="border-b border-white/5 last:border-0">
                      <td className="py-2">
                        <span className="text-zinc-200">{item.name}</span>
                        <span className="ml-2 font-mono text-[10px] text-zinc-500">{item.sku}</span>
                        <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-zinc-300">{item.quantity}</td>
                      <td className="py-2 text-right font-mono text-zinc-300">{formatUsd(item.unitPriceMinor)}</td>
                      <td className="py-2 text-right font-mono text-zinc-200">{formatUsd(offerLineTotal(item))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-3">
                <KeyValue label="Total">{formatUsd(deal.agreedOffer.totalMinor)}</KeyValue>
                <KeyValue label="Delivery">{deal.agreedOffer.deliveryDays} days</KeyValue>
                <KeyValue label="Terms">{deal.agreedOffer.terms}</KeyValue>
              </dl>
            </>
          ) : (
            <EmptyState
              title="No agreement"
              description="Negotiation turns are stored with the deal; an accepted offer appears here once both sides settle on one."
            />
          )}
        </Panel>

        <Panel
          title="Dual-signed receipt"
          description="Buyer and merchant signatures cover the same canonical receipt body and transcript root."
        >
          {receipt ? (
            <>
              <dl>
                <KeyValue label="Receipt">{receipt.id}</KeyValue>
                <KeyValue label="Issued">{formatDateTime(receipt.issuedAt)}</KeyValue>
                <KeyValue label="Digest">
                  <code className="font-mono text-[11px]">{shortHash(receipt.digest, 28)}</code>
                </KeyValue>
                <KeyValue label="Agreed price">
                  {formatUsd(receipt.agreedPrice.amountMinor)} {receipt.agreedPrice.currency}
                </KeyValue>
                <KeyValue label="Transcript hash">
                  <code className="font-mono text-[11px]">{shortHash(receipt.negotiationTranscriptHash, 28)}</code>
                </KeyValue>
                <KeyValue label="Attestations">
                  <span className="font-mono text-[11px]">
                    {receipt.attestationRefs.buyer} · {receipt.attestationRefs.merchant}
                  </span>
                </KeyValue>
                <KeyValue label="PayPal order">
                  <code className="font-mono text-[11px]">{receipt.paypalOrderId}</code>
                </KeyValue>
                <KeyValue label="Buyer signature">
                  <span className="font-mono text-[11px]">
                    {receipt.buyerSignature.signature.keyId} · {shortHash(receipt.buyerSignature.signature.value, 16)}
                  </span>
                </KeyValue>
                <KeyValue label="Merchant signature">
                  <span className="font-mono text-[11px]">
                    {receipt.merchantSignature.signature.keyId} ·{" "}
                    {shortHash(receipt.merchantSignature.signature.value, 16)}
                  </span>
                </KeyValue>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Signatures are Ed25519 over SHA-256 of canonical JSON. The transcript root commits to every handshake
                and negotiation message in order.
              </p>
            </>
          ) : (
            <EmptyState
              title="Receipt not issued"
              description="Both agents sign only after the PayPal capture completes. Without a receipt there is no evidence packet to arbitrate."
            />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel
          title="Evidence chain"
          description="Each message hashes the one before it, so edits, reorders and deletions break the chain."
        >
          {deal.transcript.length === 0 ? (
            <EmptyState
              title="No transcript"
              description="Handshake and negotiation messages are appended here as the deal runs."
            />
          ) : (
            <ol className="space-y-2">
              {deal.transcript.map((entry) => (
                <li
                  key={`${entry.seq}-${entry.payloadHash}`}
                  className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-emerald-300/80">
                      #{String(entry.seq).padStart(2, "0")} {entry.type}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500">{formatDateTime(entry.timestamp)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-zinc-300">{entry.signer}</span>
                    <code className="font-mono text-[11px] text-zinc-500">{shortHash(entry.payloadHash, 24)}</code>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">prev {shortHash(entry.prevHash, 16)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Mandate check"
            description="The first failing rule blocks the purchase; a passing check returns M-OK-00."
          >
            {deal.policy ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={deal.policy.allowed ? "emerald" : "rose"} mono>
                    {deal.policy.ruleId}
                  </Badge>
                  <span className="text-xs text-zinc-300">{deal.policy.summary}</span>
                </div>
                <ul className="mt-3 space-y-1">
                  {deal.policy.checks.map((check) => (
                    <li key={check.id} className="flex items-start gap-2 text-xs">
                      <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                        {check.passed ? "✓" : "✕"}
                      </span>
                      <span className="text-zinc-300">{check.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-500">{check.id}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                title="Not evaluated"
                description="The mandate check runs when the merchant returns its first offer."
              />
            )}
          </Panel>

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

          {deal.injectionSignals.length > 0 && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  Blocked injection attempts <Badge tone="amber">{deal.injectionSignals.length}</Badge>
                </span>
              }
              description="Counterparty text is untrusted data. These signals were recorded and never executed as instructions."
            >
              <ul className="space-y-2">
                {deal.injectionSignals.map((signal) => (
                  <li
                    key={`${signal.at}-${signal.pattern}`}
                    className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2"
                  >
                    <p className="font-mono text-[10px] text-amber-200/80">{signal.pattern}</p>
                    <p className="mt-1 text-xs text-zinc-300">“{signal.excerpt}”</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
