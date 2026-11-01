import { canonicalJson, formatUsd, type MandateCreateRequest, type MandateView } from "@handshake/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Callout,
  CopyableId,
  ErrorPanel,
  KeyValue,
  LinkButton,
  Meter,
  PageHeader,
  Panel,
  SimulatedTag,
} from "../components/ui";
import { api, ApiClientError } from "../lib/api";
import { formatExpiry } from "../lib/format";

const CATEGORY_SUGGESTIONS = ["PPE", "SAFETY", "LAB", "EQUIPMENT", "OFFICE"];
const DEFAULT_MERCHANT = "agt_merchant_ridgeway";

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const toMinor = (dollars: string): number => {
  const parsed = Number.parseFloat(dollars);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
};

export function MandateBuilderPage() {
  const [maxTotal, setMaxTotal] = useState("150.00");
  const [perItemMax, setPerItemMax] = useState("85.00");
  const [maxTransactions, setMaxTransactions] = useState("3");
  const [categories, setCategories] = useState("PPE");
  const [forbidden, setForbidden] = useState("latex");
  const [allowlist, setAllowlist] = useState(DEFAULT_MERCHANT);
  const [anyMerchant, setAnyMerchant] = useState(false);
  const [expiresInMinutes, setExpiresInMinutes] = useState("60");

  const [signed, setSigned] = useState<MandateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo<MandateCreateRequest>(
    () => ({
      agentId: "agt_buyer_demo",
      maxTotal: toMinor(maxTotal),
      perItemMax: toMinor(perItemMax),
      maxTransactions: Math.max(1, Number.parseInt(maxTransactions, 10) || 1),
      allowedCategories: splitList(categories),
      forbiddenSubstitutions: splitList(forbidden),
      merchantAllowlist: anyMerchant ? null : splitList(allowlist),
      expiresInMinutes: Math.max(5, Number.parseInt(expiresInMinutes, 10) || 60),
    }),
    [maxTotal, perItemMax, maxTransactions, categories, forbidden, anyMerchant, allowlist, expiresInMinutes],
  );

  const previewBody = useMemo(
    () => ({
      id: "<generated on sign>",
      version: "handshake.mandate.v1" as const,
      issuer: {
        id: "prn_dana",
        displayName: "Dana Ruiz",
        keyId: "key_prn_dana",
        identityLabel: "SIMULATED" as const,
      },
      agentId: draft.agentId,
      currency: "USD" as const,
      maxTotal: draft.maxTotal,
      perItemMax: draft.perItemMax,
      allowedCategories: draft.allowedCategories,
      forbiddenSubstitutions: draft.forbiddenSubstitutions,
      merchantAllowlist: draft.merchantAllowlist,
      maxTransactions: draft.maxTransactions,
      issuedAt: "<server clock>",
      expiresAt: `<now + ${draft.expiresInMinutes}m>`,
      nonce: "<random, single use>",
    }),
    [draft],
  );

  const problems: string[] = [];
  if (draft.maxTotal <= 0) problems.push("Lifetime cap must be greater than zero.");
  if (draft.perItemMax > draft.maxTotal) problems.push("Per-item cap cannot exceed the lifetime cap.");
  if (draft.allowedCategories.length === 0) problems.push("Allow at least one category.");
  if (!anyMerchant && draft.merchantAllowlist !== null && draft.merchantAllowlist.length === 0) {
    problems.push("Choose a merchant, or allow any merchant.");
  }
  if (draft.allowedCategories.some((category) => category.length > 40)) problems.push("Category names are too long.");

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      setSigned(await api.createMandate(draft));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not sign the mandate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Spending authority"
        title="Write a mandate"
        description="The human principal signs an envelope the buyer agent cannot step outside. Everything below is enforced in deterministic code at offer time, not in a prompt."
        actions={
          <LinkButton to="/mandate" tone="ghost">
            Existing mandates
          </LinkButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Panel title="Terms" description="Amounts are entered in dollars and signed as integer minor units.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mono-label">Lifetime cap (USD)</span>
                <input
                  className="field mt-1.5"
                  inputMode="decimal"
                  value={maxTotal}
                  onChange={(event) => setMaxTotal(event.target.value)}
                  aria-describedby="max-total-hint"
                />
                <span id="max-total-hint" className="mt-1 block text-[11px] text-zinc-500">
                  Totals across every deal under this mandate. {formatUsd(toMinor(maxTotal))}
                </span>
              </label>

              <label className="block">
                <span className="mono-label">Per-item cap (USD)</span>
                <input
                  className="field mt-1.5"
                  inputMode="decimal"
                  value={perItemMax}
                  onChange={(event) => setPerItemMax(event.target.value)}
                />
                <span className="mt-1 block text-[11px] text-zinc-500">
                  Applied to each cart line total. {formatUsd(toMinor(perItemMax))}
                </span>
              </label>

              <label className="block">
                <span className="mono-label">Max transactions</span>
                <input
                  className="field mt-1.5"
                  inputMode="numeric"
                  value={maxTransactions}
                  onChange={(event) => setMaxTransactions(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mono-label">Expires in (minutes)</span>
                <input
                  className="field mt-1.5"
                  inputMode="numeric"
                  value={expiresInMinutes}
                  onChange={(event) => setExpiresInMinutes(event.target.value)}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mono-label">Allowed categories</span>
                <input
                  className="field mt-1.5"
                  value={categories}
                  onChange={(event) => setCategories(event.target.value)}
                  aria-describedby="categories-hint"
                />
                <span id="categories-hint" className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  Comma separated.
                  {CATEGORY_SUGGESTIONS.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        const current = splitList(categories);
                        setCategories([...new Set([...current, category])].join(", "));
                      }}
                      className="rounded border border-white/12 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-200"
                    >
                      + {category}
                    </button>
                  ))}
                </span>
              </label>

              <label className="block sm:col-span-2">
                <span className="mono-label">Forbidden substitutions</span>
                <input
                  className="field mt-1.5"
                  value={forbidden}
                  onChange={(event) => setForbidden(event.target.value)}
                  aria-describedby="forbidden-hint"
                />
                <span id="forbidden-hint" className="mt-1 block text-[11px] text-zinc-500">
                  Tokens matched against each line's SKU and product name, case-insensitively.
                </span>
              </label>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={anyMerchant}
                    onChange={(event) => setAnyMerchant(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 accent-emerald-400"
                  />
                  Allow any merchant
                </label>
                {!anyMerchant && (
                  <label className="mt-3 block">
                    <span className="mono-label">Merchant allowlist</span>
                    <input
                      className="field mt-1.5"
                      value={allowlist}
                      onChange={(event) => setAllowlist(event.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>

            {problems.length > 0 && (
              <div className="mt-4">
                <Callout tone="amber" title="The mandate cannot be signed yet">
                  <ul className="list-inside list-disc space-y-0.5">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => void sign()} disabled={busy || problems.length > 0}>
                {busy ? "Signing…" : "Sign mandate"}
              </Button>
              <span className="text-[11px] text-zinc-500">
                Signed with the demo principal's Ed25519 key. Keys live in the local database — SIMULATED identity.
              </span>
            </div>
            {error && (
              <div className="mt-4">
                <ErrorPanel message={error} onRetry={() => void sign()} />
              </div>
            )}
          </Panel>

          {signed && (
            <Panel
              title={
                <span className="flex flex-wrap items-center gap-2">
                  Mandate signed <Badge tone="emerald" mono>{signed.mandate.id}</Badge>
                </span>
              }
              description="Read back from the database after signing — this is the stored envelope, not the form."
              actions={<SimulatedTag label="Simulated principal" />}
            >
              <Meter
                percent={(signed.ledger.settledMinor + signed.ledger.reservedMinor) / signed.mandate.maxTotal * 100}
                label="Budget committed"
                value={`${formatUsd(signed.ledger.settledMinor + signed.ledger.reservedMinor)} / ${formatUsd(signed.mandate.maxTotal)}`}
              />
              <dl className="mt-4">
                <KeyValue label="Mandate">
                  <CopyableId value={signed.mandate.id} />
                </KeyValue>
                <KeyValue label="Signature key">
                  <code className="font-mono text-[11px]">{signed.mandate.signature.keyId}</code>
                </KeyValue>
                <KeyValue label="Nonce">
                  <code className="font-mono text-[11px]">{signed.mandate.nonce}</code>
                </KeyValue>
                <KeyValue label="Expires">{formatExpiry(signed.mandate.expiresAt)}</KeyValue>
                <KeyValue label="Active">{signed.active ? "yes" : "no"}</KeyValue>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Use it now:{" "}
                <Link to="/" className="text-emerald-200 hover:text-emerald-100">
                  start a deal from the overview
                </Link>{" "}
                once the API exposes it in the mandate list.
              </p>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel
            title="Live preview"
            description="The canonical JSON below is exactly the byte string the principal's key signs. Generated fields are stamped by the server at signing time."
          >
            <div className="space-y-3">
              <Meter
                percent={draft.perItemMax / Math.max(1, draft.maxTotal) * 100}
                label="Per-item cap as a share of the lifetime cap"
                value={`${Math.round((draft.perItemMax / Math.max(1, draft.maxTotal)) * 100)}%`}
              />
              <dl>
                <KeyValue label="Lifetime cap">{formatUsd(draft.maxTotal)}</KeyValue>
                <KeyValue label="Per item">{formatUsd(draft.perItemMax)}</KeyValue>
                <KeyValue label="Transactions">{draft.maxTransactions}</KeyValue>
                <KeyValue label="Window">{draft.expiresInMinutes} minutes</KeyValue>
                <KeyValue label="Categories">
                  <span className="flex flex-wrap justify-end gap-1">
                    {draft.allowedCategories.length === 0 ? (
                      <span className="text-zinc-500">none</span>
                    ) : (
                      draft.allowedCategories.map((category) => (
                        <code key={category} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px]">
                          {category}
                        </code>
                      ))
                    )}
                  </span>
                </KeyValue>
                <KeyValue label="Forbidden">
                  <span className="flex flex-wrap justify-end gap-1">
                    {draft.forbiddenSubstitutions.length === 0 ? (
                      <span className="text-zinc-500">none</span>
                    ) : (
                      draft.forbiddenSubstitutions.map((token) => (
                        <code key={token} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px]">
                          {token}
                        </code>
                      ))
                    )}
                  </span>
                </KeyValue>
                <KeyValue label="Merchant">
                  {draft.merchantAllowlist === null ? "any merchant" : draft.merchantAllowlist.join(", ")}
                </KeyValue>
              </dl>
            </div>

            <details className="mt-4 rounded-lg border border-white/8 bg-black/30">
              <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-zinc-300">
                Canonical signing payload
              </summary>
              <pre className="max-h-72 overflow-auto px-3 pb-3 font-mono text-[10px] leading-relaxed text-zinc-400">
                {canonicalJson(previewBody)}
              </pre>
            </details>
          </Panel>

          <Panel
            title="What the agent may do with this"
            description="These are the checks the guard runs on every priced offer, in this order."
          >
            <ol className="space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
              {[
                "Inside the validity window",
                "Merchant on the allowlist",
                "Every line item in an allowed category",
                "No forbidden substitution",
                "Currency matches the mandate",
                "Line arithmetic adds up to the stated total",
                "Each line within the per-item cap",
                "Total within the remaining lifetime budget",
                "Transaction count within the mandate",
              ].map((rule, index) => (
                <li key={rule} className="flex gap-2">
                  <span className="font-mono text-emerald-300/70">{String(index + 1).padStart(2, "0")}</span>
                  {rule}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
