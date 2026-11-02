import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiClientError } from "../lib/api";
import { Pill } from "./primitives";

const CATEGORIES = ["PPE", "safety", "office", "lab", "logistics"] as const;

/**
 * Right-hand glass drawer. The preview below is the exact envelope the API will
 * sign; the signature itself is issued server-side, so nothing implies it exists
 * before the request succeeds.
 */
export function MandateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [total, setTotal] = useState("200.00");
  const [perItem, setPerItem] = useState("85.00");
  const [transactions, setTransactions] = useState("4");
  const [expiryMinutes, setExpiryMinutes] = useState("240");
  const [categories, setCategories] = useState<string[]>(["PPE"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxTotal = Math.round(Number(total) * 100);
  const perItemMax = Math.round(Number(perItem) * 100);
  const transactionsCount = Number(transactions);
  const valid =
    Number.isFinite(maxTotal) &&
    maxTotal > 0 &&
    Number.isFinite(perItemMax) &&
    perItemMax > 0 &&
    perItemMax <= maxTotal &&
    Number.isInteger(transactionsCount) &&
    transactionsCount >= 1 &&
    categories.length > 0;

  const preview = {
    version: "handshake.mandate.v1",
    agentId: "agt_buyer_demo",
    currency: "USD",
    maxTotal: Number.isFinite(maxTotal) ? maxTotal : 0,
    perItemMax: Number.isFinite(perItemMax) ? perItemMax : 0,
    allowedCategories: categories,
    forbiddenSubstitutions: [],
    merchantAllowlist: null,
    maxTransactions: Number.isFinite(transactionsCount) ? transactionsCount : 0,
    expiresInMinutes: Number(expiryMinutes),
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.createMandate({
        agentId: "agt_buyer_demo",
        maxTotal,
        perItemMax,
        maxTransactions: transactionsCount,
        allowedCategories: categories,
        forbiddenSubstitutions: [],
        merchantAllowlist: null,
        expiresInMinutes: Number(expiryMinutes),
      });
      onClose();
      navigate("/mandate");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The mandate could not be signed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: "absolute", inset: 0, background: "rgba(5,7,24,0.55)", zIndex: 50 }}
        >
          <motion.aside
            role="dialog"
            aria-label="New mandate"
            initial={reduce ? { opacity: 0 } : { x: 520 }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: 520 }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 620,
              background: "rgba(20, 23, 46, 0.92)",
              borderLeft: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(22px)",
              padding: "40px 40px 0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 18, color: "rgba(255,255,255,0.55)" }}>Signed authority</p>
                <h2 className="hs-card-title" style={{ marginTop: 6 }}>
                  New mandate
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: 26,
                }}
              >
                ✕
              </button>
            </div>

            <div className="hs-scroll" style={{ marginTop: 28, flex: 1 }}>
              <div style={{ display: "grid", gap: 18 }}>
                <Field label="Lifetime cap (USD)">
                  <input
                    className="hs-input"
                    value={total}
                    onChange={(event) => setTotal(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Per-item cap (USD)">
                  <input
                    className="hs-input"
                    value={perItem}
                    onChange={(event) => setPerItem(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  <Field label="Max transactions">
                    <input
                      className="hs-input"
                      value={transactions}
                      onChange={(event) => setTransactions(event.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Expires in (minutes)">
                    <input
                      className="hs-input"
                      value={expiryMinutes}
                      onChange={(event) => setExpiryMinutes(event.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                </div>

                <div>
                  <p className="mono-label">Allowed categories</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                    {CATEGORIES.map((category) => {
                      const on = categories.includes(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() =>
                            setCategories((current) =>
                              on ? current.filter((value) => value !== category) : [...current, category],
                            )
                          }
                          aria-pressed={on}
                        >
                          <Pill tone={on ? "success" : "neutral"} size={18}>
                            {category}
                          </Pill>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p className="mono-label">Canonical envelope · preview</p>
                    <Pill tone="neutral" size={14}>
                      signature on submit
                    </Pill>
                  </div>
                  <pre
                    style={{
                      marginTop: 10,
                      maxHeight: 260,
                      overflow: "auto",
                      borderRadius: 22,
                      background: "rgba(0,0,0,0.32)",
                      padding: 18,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: "rgba(255,255,255,0.78)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                  <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>
                    Ed25519 over canonical JSON. The preview is unsigned: the API issues the signature and returns the
                    signed envelope.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: "22px 0 34px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {error && (
                <p style={{ fontSize: 16, color: "#FCA5A5", marginBottom: 12 }} role="alert">
                  {error}
                </p>
              )}
              {!valid && (
                <p style={{ fontSize: 16, color: "#FFD84D", marginBottom: 12 }}>
                  Per-item cap must be positive and cannot exceed the lifetime cap. Pick at least one category.
                </p>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || !valid}
                  style={{
                    height: 76,
                    padding: "0 34px",
                    borderRadius: 999,
                    background: "#CBF47B",
                    color: "#0B0B0B",
                    fontSize: 24,
                    fontWeight: 600,
                    opacity: busy || !valid ? 0.5 : 1,
                  }}
                >
                  {busy ? "Signing…" : "Sign mandate"}
                </button>
                <a
                  href="/mandate/new"
                  onClick={(event) => {
                    event.preventDefault();
                    onClose();
                    navigate("/mandate/new");
                  }}
                  style={{ fontSize: 20, color: "rgba(255,255,255,0.62)" }}
                >
                  Full builder →
                </a>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mono-label">{label}</span>
      <div style={{ marginTop: 8 }}>{children}</div>
    </label>
  );
}
