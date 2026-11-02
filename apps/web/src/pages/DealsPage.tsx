import type { DealSummary } from "@handshake/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "../lib/format";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { PageStage, SectionCard } from "../ui/Screen";
import { Avatar, GlassPill, Money, Pill, SectionHeader, type PillTone } from "../ui/primitives";

type Filter = "ALL" | "SETTLED" | "DISPUTED" | "FAILED";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "ALL", label: "All deals" },
  { id: "SETTLED", label: "Settled" },
  { id: "DISPUTED", label: "Disputed" },
  { id: "FAILED", label: "Failed" },
];

function filterOf(deal: DealSummary): Filter {
  if (deal.status === "FAILED") return "FAILED";
  if (deal.status === "DISPUTED") return "DISPUTED";
  if (deal.status === "RESOLVED" || deal.status === "RECEIPT_SIGNED") return "SETTLED";
  return "ALL";
}

function toneOf(deal: DealSummary): { label: string; tone: PillTone } {
  switch (filterOf(deal)) {
    case "FAILED":
      return { label: "Denied", tone: "down" };
    case "DISPUTED":
      return { label: "Disputed", tone: "down" };
    case "SETTLED":
      return { label: deal.status === "RECEIPT_SIGNED" ? "Verified" : "Settled", tone: "success" };
    default:
      return { label: deal.status.replaceAll("_", " "), tone: "neutral" };
  }
}

/**
 * Deal list. Every row is a real deal with a hash-chained transcript behind it;
 * the split chat, handshake checks and dual-signed receipt live one click away.
 */
export function DealsPage() {
  const navigate = useNavigate();
  const deals = useResource(() => api.deals(), []);
  const [filter, setFilter] = useState<Filter>("ALL");

  const rows = useMemo(() => {
    const list = deals.state.status === "success" ? deals.state.data.deals : [];
    const sorted = list.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return filter === "ALL" ? sorted : sorted.filter((deal) => filterOf(deal) === filter);
  }, [deals.state, filter]);

  const all = deals.state.status === "success" ? deals.state.data.deals : [];
  const settledMinor = all
    .filter((deal) => filterOf(deal) === "SETTLED")
    .reduce((sum, deal) => sum + deal.amountMinor, 0);

  return (
    <PageStage
      title="Deals"
      titleAccessory={
        <Pill tone="glass" size={18}>
          {all.length} on file
        </Pill>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 23 }}>
        <SummaryTile label="Deals" value={String(all.length)} caption="negotiated through the pipeline" />
        <SummaryTile label="Settled volume" value="" minor={settledMinor} caption="captured, receipt signed" />
        <SummaryTile
          label="Disputed"
          value={String(all.filter((deal) => filterOf(deal) === "DISPUTED").length)}
          caption="reached the dispute court"
        />
      </div>

      <section style={{ marginTop: 23 }}>
        <SectionCard tint="ledger" radius={48} padding={28}>
          <SectionHeader
            title="All deals"
            count={rows.length}
            subtitle="Select a deal to read its handshake, guard decisions and receipt."
            action={
              <div style={{ display: "flex", gap: 10 }}>
                {FILTERS.map((item) => (
                  <GlassPill
                    key={item.id}
                    width={140}
                    height={52}
                    active={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </GlassPill>
                ))}
              </div>
            }
          />

          <ul style={{ marginTop: 18 }}>
            {rows.map((deal) => {
              const status = toneOf(deal);
              return (
                <li key={deal.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "66px 1.4fr 150px 1fr 0.9fr 180px 40px",
                      alignItems: "center",
                      gap: 16,
                      width: "100%",
                      padding: "18px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      textAlign: "left",
                    }}
                  >
                    <Avatar name={deal.merchantName} tone="merchant" size={66} />
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 500,
                        letterSpacing: "-0.01em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {deal.merchantName}
                    </span>
                    <Pill tone={status.tone} size={17} style={{ justifySelf: "start" }}>
                      {status.label}
                    </Pill>
                    <span style={{ fontSize: 20, color: "rgba(255,255,255,0.55)" }}>
                      {formatDateTime(deal.createdAt)}
                    </span>
                    <span className="hs-mono" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {deal.signatures}/2 signatures
                    </span>
                    <Money minor={deal.amountMinor} size={38} weight={500} className="justify-self-end" />
                    <span style={{ justifySelf: "end", color: "rgba(255,255,255,0.5)", fontSize: 24 }}>›</span>
                  </button>
                </li>
              );
            })}

            {deals.state.status === "success" && rows.length === 0 && (
              <li style={{ padding: "28px 0", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
                {all.length === 0
                  ? "No deals yet. Run Case A from the dashboard to create one."
                  : "No deal matches this filter."}
              </li>
            )}
            {deals.state.status === "loading" && (
              <li style={{ padding: "28px 0", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>Loading deals…</li>
            )}
            {deals.state.status === "error" && (
              <li style={{ padding: "28px 0", fontSize: 22, color: "#FCA5A5" }}>{deals.state.error}</li>
            )}
          </ul>
        </SectionCard>
      </section>
    </PageStage>
  );
}

function SummaryTile({
  label,
  value,
  minor,
  caption,
}: {
  label: string;
  value: string;
  minor?: number;
  caption: string;
}) {
  return (
    <SectionCard tint="rail" radius={40} padding={28} style={{ height: 170 }}>
      <p style={{ fontSize: 22, color: "rgba(255,255,255,0.62)" }}>{label}</p>
      <div style={{ marginTop: 10 }}>
        {minor !== undefined ? (
          <Money minor={minor} size={52} weight={500} />
        ) : (
          <span style={{ fontSize: 52, fontWeight: 500 }}>{value}</span>
        )}
      </div>
      <p style={{ marginTop: 8, fontSize: 18, color: "rgba(255,255,255,0.45)" }}>{caption}</p>
    </SectionCard>
  );
}
