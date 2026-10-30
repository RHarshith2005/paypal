import { formatUsd, type MandateView } from "@handshake/shared";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  KeyValue,
  LoadingPanel,
  PageHeader,
  Panel,
  SimulatedTag,
} from "../components/ui";
import { api } from "../lib/api";
import { formatExpiry } from "../lib/format";
import { useResource } from "../lib/useResource";

const ENFORCEMENT_ORDER = [
  "Mandate is inside its validity window",
  "Merchant is approved by the principal",
  "Every line item is in an allowed category",
  "No forbidden substitution",
  "Offer currency matches the mandate",
  "Line-item arithmetic is consistent",
  "Every line total is within the per-item cap",
  "Total fits the remaining lifetime budget",
  "Transaction count is within the mandate",
] as const;

function BudgetMeter({ view }: { view: MandateView }) {
  const used = view.ledger.settledMinor + view.ledger.reservedMinor;
  const percent = Math.min(100, Math.round((used / view.mandate.maxTotal) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-zinc-400">
        <span className="mono-label">Budget committed</span>
        <span className="font-mono text-zinc-300">
          {formatUsd(used)} / {formatUsd(view.mandate.maxTotal)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mandate budget committed"
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-zinc-500">
        <span>{formatUsd(view.remainingMinor)} remaining</span>
        <span>
          {view.ledger.settledCount + view.ledger.reservedCount} / {view.mandate.maxTransactions} transactions
        </span>
      </div>
    </div>
  );
}

function Terms({ values }: { values: readonly string[] }) {
  if (values.length === 0) return <span className="text-zinc-500">none</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {values.map((value) => (
        <code key={value} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px]">
          {value}
        </code>
      ))}
    </span>
  );
}

function MandateCard({ view }: { view: MandateView }) {
  const { mandate } = view;
  return (
    <Panel
      className="mb-6"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {mandate.issuer.displayName}
          <Badge tone={view.active ? "emerald" : "rose"}>{view.active ? "Active" : "Expired"}</Badge>
          <SimulatedTag label="Simulated principal" />
        </span>
      }
      description={`Signed spending authority for ${mandate.agentId}. Limits are evaluated in deterministic code on every offer.`}
    >
      <div className="mb-5">
        <BudgetMeter view={view} />
      </div>
      <dl className="grid gap-x-8 sm:grid-cols-2">
        <div>
          <KeyValue label="Mandate">{mandate.id}</KeyValue>
          <KeyValue label="Issuer">{mandate.issuer.id}</KeyValue>
          <KeyValue label="Bound agent">{mandate.agentId}</KeyValue>
          <KeyValue label="Lifetime cap">{formatUsd(mandate.maxTotal)}</KeyValue>
          <KeyValue label="Per-item cap">{formatUsd(mandate.perItemMax)}</KeyValue>
          <KeyValue label="Max transactions">{mandate.maxTransactions}</KeyValue>
        </div>
        <div>
          <KeyValue label="Currency">{mandate.currency}</KeyValue>
          <KeyValue label="Merchant allowlist">
            {mandate.merchantAllowlist === null ? (
              <span className="text-zinc-500">any merchant</span>
            ) : (
              <Terms values={mandate.merchantAllowlist} />
            )}
          </KeyValue>
          <KeyValue label="Categories">
            <Terms values={mandate.allowedCategories} />
          </KeyValue>
          <KeyValue label="Forbidden substitutions">
            <Terms values={mandate.forbiddenSubstitutions} />
          </KeyValue>
          <KeyValue label="Expires">{formatExpiry(mandate.expiresAt)}</KeyValue>
          <KeyValue label="Signature key">
            <code className="font-mono text-[11px]">{mandate.signature.keyId}</code>
          </KeyValue>
          <KeyValue label="Nonce">
            <code className="font-mono text-[11px]">{mandate.nonce}</code>
          </KeyValue>
        </div>
      </dl>
    </Panel>
  );
}

export function MandatePage() {
  const mandates = useResource(() => api.mandates(), []);
  const views = mandates.state.status === "success" ? mandates.state.data.mandates : [];

  return (
    <div>
      <PageHeader
        eyebrow="Spending authority"
        title="The mandate"
        description="A human principal signs the envelope their buyer agent must stay inside. The agent can choose how to negotiate; it cannot choose to exceed these limits."
      />

      {mandates.state.status === "loading" && <LoadingPanel label="Loading signed mandates…" />}
      {mandates.state.status === "error" && <ErrorPanel message={mandates.state.error} onRetry={mandates.reload} />}

      {mandates.state.status === "success" && views.length === 0 && (
        <div className="mb-6">
          <EmptyState
            title="No spending mandate on file"
            description="A mandate is created by the human principal and signed with Ed25519 before an agent may spend. Its terms, live budget and enforcement history appear here as soon as one exists."
          />
        </div>
      )}

      {views.map((view) => (
        <MandateCard key={view.mandate.id} view={view} />
      ))}

      <Panel
        title="Enforcement order"
        description="The buyer agent's model output is never the authority. Each proposed purchase runs this sequence; the first failing check blocks the deal and returns its rule id."
      >
        <ol className="grid gap-2 sm:grid-cols-2">
          {ENFORCEMENT_ORDER.map((step, index) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
            >
              <span className="mt-0.5 font-mono text-[11px] text-emerald-300/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-xs leading-relaxed text-zinc-300">{step}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
