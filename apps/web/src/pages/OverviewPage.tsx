import {
  formatUsd,
  type DealSummary,
  type DealView,
  type DisputeListItem,
  type MandateView,
  type AgentTrust,
} from "@handshake/shared";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiClientError } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useResource } from "../lib/useResource";
import { AgentStack, type AgentCardModel } from "../ui/AgentStack";
import { DealFlowChart, type FlowPoint } from "../ui/DealFlow";
import { Donut, DonutLegend, type DonutSegment } from "../ui/Donut";
import { MandateDrawer } from "../ui/MandateDrawer";
import { PageStage, SectionCard } from "../ui/Screen";
import {
  Avatar,
  CountMoney,
  GlassPill,
  GooeyButton,
  Money,
  Pill,
  RoundArrowButton,
  SectionHeader,
  type PillTone,
} from "../ui/primitives";
import { VERDICT_SEGMENTS, type VerdictSegmentId } from "../ui/tokens";

type Period = "weekly" | "monthly";

interface Bucket extends FlowPoint {
  fromMs: number;
  toMs: number;
}

function statusOf(deal: DealSummary, disputed: boolean): { label: string; tone: PillTone } {
  if (deal.status === "FAILED") return { label: "Denied", tone: "down" };
  if (disputed || deal.status === "DISPUTED") return { label: "Disputed", tone: "down" };
  if (deal.status === "RECEIPT_SIGNED") return { label: "Verified", tone: "success" };
  if (deal.status === "RESOLVED") return { label: "Settled", tone: "success" };
  return { label: deal.status.replaceAll("_", " "), tone: "neutral" };
}

function buildBuckets(deals: DealSummary[], period: Period): Bucket[] {
  const now = new Date();
  const count = 5;

  const ranges = Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    if (period === "weekly") {
      const to = new Date(now);
      to.setHours(23, 59, 59, 999);
      to.setDate(to.getDate() - offset * 7);
      const from = new Date(to);
      from.setDate(to.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to, label: `W${index + 1}` };
    }
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
    return { from, to, label: from.toLocaleString("en-US", { month: "short" }) };
  });

  const rows = ranges.map((range, index) => {
    const inside = deals.filter((deal) => {
      const at = Date.parse(deal.createdAt);
      return at >= range.from.getTime() && at <= range.to.getTime();
    });
    return {
      range,
      index,
      count: inside.length,
      valueMinor: inside.reduce((sum, deal) => sum + deal.amountMinor, 0),
    };
  });

  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const deltaPercent =
      previous && previous.count > 0 && row.index > 0
        ? Math.round(((row.count - previous.count) / previous.count) * 100)
        : null;
    return {
      id: `${period}-${row.index}`,
      label: row.range.label,
      count: row.count,
      valueMinor: row.valueMinor,
      deltaPercent,
      fromMs: row.range.from.getTime(),
      toMs: row.range.to.getTime(),
    };
  });
}

export function OverviewPage() {
  const navigate = useNavigate();
  const health = useResource(() => api.health(), []);
  const mandates = useResource(() => api.mandates(), []);
  const ledger = useResource(() => api.ledger(), []);
  const deals = useResource(() => api.deals(), []);
  const disputes = useResource(() => api.disputes(), []);
  const agents = useResource(() => api.agents(), []);

  const [period, setPeriod] = useState<Period>("monthly");
  const [activeBar, setActiveBar] = useState<string | null>(null);
  const [activeVerdict, setActiveVerdict] = useState<VerdictSegmentId | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("buyer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const mandateList: MandateView[] = mandates.state.status === "success" ? mandates.state.data.mandates : [];
  const entries = ledger.state.status === "success" ? ledger.state.data.entries : [];
  const dealList = useMemo(
    () =>
      (deals.state.status === "success" ? deals.state.data.deals : [])
        .slice()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [deals.state],
  );
  const disputeList: DisputeListItem[] = useMemo(
    () => (disputes.state.status === "success" ? disputes.state.data.disputes : []),
    [disputes.state],
  );
  const agentList: AgentTrust[] = agents.state.status === "success" ? agents.state.data.agents : [];

  const primary =
    mandateList.find((view) => view.active && view.remainingMinor > 0) ??
    mandateList.find((view) => view.mandate.id === "mnd_case_a") ??
    mandateList[0];

  const settledMinor = entries
    .filter((entry) => entry.status === "SETTLED")
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
  const disputedDeals = new Set(disputeList.map((item) => item.dispute.dealId));
  const disputedMinor = entries
    .filter((entry) => entry.status === "SETTLED" && disputedDeals.has(entry.dealId))
    .reduce((sum, entry) => sum + entry.amountMinor, 0);

  const buckets = useMemo(() => buildBuckets(dealList, period), [dealList, period]);
  const activeBucket = buckets.find((bucket) => bucket.id === activeBar) ?? null;

  const verdictByDeal = useMemo(() => {
    const map = new Map<string, VerdictSegmentId | "HANDSHAKE_FAILED" | "PAYMENT_FAILED">();
    for (const item of disputeList) {
      const verdict = item.dispute.ruling?.verdict;
      if (verdict) map.set(item.dispute.dealId, verdict as VerdictSegmentId);
      else if (item.packet?.payment.status === "FAILED") map.set(item.dispute.dealId, "PAYMENT_FAILED");
      else if (!item.packet?.handshake) map.set(item.dispute.dealId, "HANDSHAKE_FAILED");
    }
    return map;
  }, [disputeList]);

  const segments: DonutSegment[] = VERDICT_SEGMENTS.map((segment) => ({
    id: segment.id,
    label: segment.label,
    color: segment.color,
    value: disputeList.filter((item) => verdictByDeal.get(item.dispute.dealId) === segment.id).length,
  }));
  const totalCases = disputeList.length;

  const visibleDeals = dealList.filter((deal) => {
    if (activeBucket) {
      const at = Date.parse(deal.createdAt);
      if (at < activeBucket.fromMs || at > activeBucket.toMs) return false;
    }
    if (activeVerdict) {
      if (verdictByDeal.get(deal.id) !== activeVerdict) return false;
    }
    return true;
  });

  const latestDealId = dealList[0]?.id ?? null;
  const detail = useResource<DealView | null>(
    () => (latestDealId ? api.deal(latestDealId) : Promise.resolve(null)),
    [latestDealId],
  );
  const receipt = detail.state.status === "success" ? (detail.state.data?.deal.receipt ?? null) : null;

  const counterparties = useMemo(() => {
    const names = dealList.map((deal) => deal.merchantName);
    const unique = [...new Set(names)];
    return (unique.length > 0 ? unique : ["Trust anchor"]).slice(0, 5);
  }, [dealList]);

  const mandateExpiry = primary
    ? new Date(primary.mandate.expiresAt).toLocaleDateString("en-US", { month: "2-digit", year: "2-digit" })
    : null;

  const buyers = agentList.filter((agent) => agent.kind === "BUYER_AGENT");
  const merchants = agentList.filter((agent) => agent.kind === "MERCHANT_AGENT");
  const buyer = buyers[0];
  const merchant = merchants[0];

  const cards: AgentCardModel[] = [
    {
      id: "anchor",
      name: "Trust anchor",
      role: "Attestation issuer",
      tone: "anchor",
      score: null,
      grade: null,
      keyId: null,
      mandateExpiry: null,
      simulated: true,
    },
    {
      id: "merchant",
      name: merchant?.displayName ?? "Merchant agent",
      role: "Counterparty",
      tone: "merchant",
      score: merchant?.score ?? null,
      grade: merchant?.grade ?? null,
      keyId: receipt?.merchantSignature.signature.keyId ?? null,
      mandateExpiry: null,
      simulated: false,
    },
    {
      id: "buyer",
      name: buyer?.displayName ?? "Buyer agent",
      role: "Spends the mandate",
      tone: "buyer",
      score: buyer?.score ?? null,
      grade: buyer?.grade ?? null,
      keyId: receipt?.buyerSignature.signature.keyId ?? null,
      mandateExpiry,
      simulated: false,
    },
  ];

  const runCase = async (caseLabel: "A" | "B") => {
    setBusy(caseLabel);
    setError(null);
    try {
      const run = await api.runDemo(caseLabel);
      navigate(`/deals/${run.dealId}`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The demo case could not be started.");
    } finally {
      setBusy(null);
    }
  };

  const resetDemo = async () => {
    setBusy("reset");
    setError(null);
    try {
      await api.resetDemo();
      mandates.reload();
      ledger.reload();
      deals.reload();
      disputes.reload();
      agents.reload();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The demo data could not be reset.");
    } finally {
      setBusy(null);
    }
  };

  const cap = primary?.mandate.maxTotal ?? 0;
  const spent = primary ? primary.ledger.settledMinor + primary.ledger.reservedMinor : 0;
  const remaining = primary?.remainingMinor ?? 0;
  const mandateCount = mandateList.length;

  return (
    <PageStage
      title="Trust Dashboard"
      titleAccessory={
        <Pill tone={health.state.status === "error" ? "down" : "glass"} size={18}>
          {health.state.status === "error" ? "API offline" : "Live pipeline"}
        </Pill>
      }
      overlay={<MandateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
      right={
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <SectionHeader
            title="My agents"
            count={3}
            action={
              <GooeyButton
                label="Add"
                width={185}
                height={55}
                ariaLabel="New mandate"
                onClick={() => setDrawerOpen(true)}
                icon={<span style={{ fontSize: 24, lineHeight: 1 }}>+</span>}
              />
            }
          />

          <div style={{ marginTop: 18 }}>
            <AgentStack agents={cards} selectedId={selectedAgent} onSelect={setSelectedAgent} />
          </div>

          <div style={{ marginTop: 26 }}>
            <SectionHeader
              title="Active mandates"
              count={mandateCount}
              action={
                <button
                  type="button"
                  onClick={() => navigate("/mandate")}
                  style={{ fontSize: 22, color: "rgba(255,255,255,0.72)" }}
                >
                  Manage ›
                </button>
              }
            />
          </div>

          <div style={{ display: "flex", marginTop: 18 }}>
            {counterparties.map((name, index) => {
              const tone = (["merchant", "violet", "buyer", "anchor", "neutral"] as const)[index]!;
              return (
                <div key={`${name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -20, zIndex: 5 - index }}>
                  <Avatar name={name} tone={tone} size={78} ring="#1F2135" />
                </div>
              );
            })}
          </div>

          <div
            className="hs-fade-bottom"
            style={{
              marginTop: 18,
              borderRadius: 40,
              padding: 22,
              background: "rgba(255,255,255,0.05)",
              overflow: "hidden",
              flex: 1,
              minHeight: 0,
            }}
          >
            <ul style={{ display: "grid", gap: 12 }}>
              {mandateList.slice(0, 4).map((view) => {
                const expiry = new Date(view.mandate.expiresAt).toLocaleDateString("en-US", {
                  day: "2-digit",
                  month: "short",
                });
                return (
                  <li
                    key={view.mandate.id}
                    style={{
                      position: "relative",
                      height: 98,
                      width: "100%",
                      borderRadius: 30,
                      background: "rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "0 16px",
                    }}
                  >
                    <span
                      style={{
                        width: 66,
                        height: 66,
                        borderRadius: 20,
                        background: view.active ? "linear-gradient(140deg,#6F78E6,#5560C9)" : "rgba(255,255,255,0.12)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 22,
                        fontWeight: 600,
                        color: "#fff",
                      }}
                    >
                      {view.mandate.allowedCategories[0]?.slice(0, 2).toUpperCase() ?? "MA"}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 28,
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {view.mandate.allowedCategories.join(" · ")}
                      </span>
                      <span style={{ display: "block", fontSize: 22, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                        {view.active ? `Expires ${expiry}` : "Expired"} · {view.mandate.maxTransactions} tx
                      </span>
                    </span>
                    <Money minor={view.mandate.maxTotal} size={38} />
                    <button
                      type="button"
                      aria-label={`Actions for mandate ${view.mandate.id}`}
                      onClick={() => setOpenMenu(openMenu === view.mandate.id ? null : view.mandate.id)}
                      style={{ width: 40, height: 40, color: "rgba(255,255,255,0.6)", fontSize: 24 }}
                    >
                      ⋮
                    </button>

                    {openMenu === view.mandate.id && (
                      <div
                        style={{
                          position: "absolute",
                          right: 10,
                          top: 78,
                          zIndex: 20,
                          minWidth: 220,
                          borderRadius: 20,
                          padding: 8,
                          background: "#171A33",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => navigate("/mandate")}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            fontSize: 18,
                          }}
                        >
                          View signature
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate("/mandate/new")}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            fontSize: 18,
                          }}
                        >
                          Open in builder
                        </button>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(view.mandate.id)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            fontSize: 18,
                          }}
                        >
                          Copy mandate id
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {mandateList.length === 0 && (
                <li style={{ fontSize: 20, color: "rgba(255,255,255,0.55)", padding: 8 }}>
                  No mandate yet. Sign one to give the buyer agent authority.
                </li>
              )}
            </ul>
          </div>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "829px 408px", gap: 23 }}>
        <section
          data-testid="balance-card"
          className="hs-balance"
          style={{
            position: "relative",
            height: 450,
            borderRadius: 48,
            padding: 28,
            color: "#0B0B0B",
            overflow: "hidden",
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                right: -90,
                top: -120,
                width: 300,
                height: 620,
                background: "linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.05))",
                transform: "rotate(9deg)",
                clipPath: "polygon(38% 0, 100% 0, 62% 100%, 0 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 258,
                width: 124,
                height: 122,
                borderRadius: "60px 0 0 60px",
                background: "rgba(11,11,11,0.11)",
              }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <h2 className="hs-card-title">Mandate budget remaining</h2>
            <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 12 }}>
              <CountMoney minor={remaining} size={80} weight={500} />
            </div>
            <p style={{ marginTop: 10, fontSize: 22, color: "rgba(11,11,11,0.66)" }}>
              {primary
                ? `${formatUsd(spent)} spent of ${formatUsd(cap)} mandate`
                : "No mandate signed yet — every spend is blocked until a human signs one."}
            </p>
          </div>

          <div style={{ position: "absolute", left: 28, bottom: 28, display: "flex", gap: 16 }}>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              style={{
                height: 76,
                width: 165,
                borderRadius: 999,
                background: "#0B0B0B",
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              New mandate
            </button>
            <GooeyButton
              label={busy === "A" ? "Running…" : "Run Case A"}
              width={235}
              height={76}
              ariaLabel="Run Case A"
              onClick={() => void runCase("A")}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M7 17 17 7M9 7h8v8"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            <button
              type="button"
              onClick={() => void runCase("B")}
              style={{
                height: 76,
                width: 170,
                borderRadius: 999,
                background: "rgba(11,11,11,0.12)",
                color: "#0B0B0B",
                fontSize: 20,
                fontWeight: 500,
              }}
            >
              Run Case B
            </button>
          </div>

          <div style={{ position: "absolute", right: 28, bottom: 26, display: "flex", alignItems: "center", gap: 14 }}>
            {error && <span style={{ fontSize: 16, color: "#7A1420" }}>{error}</span>}
            <button
              type="button"
              onClick={() => void resetDemo()}
              disabled={busy !== null}
              style={{ fontSize: 17, color: "rgba(11,11,11,0.55)", textDecoration: "underline" }}
            >
              {busy === "reset" ? "Resetting…" : "Reset demo data"}
            </button>
          </div>
        </section>

        <div style={{ display: "grid", gap: 23 }}>
          <KpiCard
            title="Settled volume"
            minor={settledMinor}
            caption="Settled ledger entries"
            tone="income"
            delta={settledMinor > 0 ? "up" : "neutral"}
            deltaLabel={`${entries.filter((entry) => entry.status === "SETTLED").length} entries`}
          />
          <KpiCard
            title="Disputed volume"
            minor={disputedMinor}
            caption="Settled volume under dispute"
            tone="expense"
            delta={disputedMinor > 0 ? "down" : "neutral"}
            deltaLabel={`${disputeList.length} case${disputeList.length === 1 ? "" : "s"}`}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "619px 618px", gap: 23, marginTop: 23 }}>
        <SectionCard testId="deal-flow-card" tint="revenue" radius={48} padding={28} style={{ height: 450 }}>
          <SectionHeader
            title="Deal flow"
            subtitle="Deals created per period, from the deal table"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <GlassPill
                  width={163}
                  height={56}
                  active
                  onClick={() => setPeriod(period === "monthly" ? "weekly" : "monthly")}
                >
                  {period === "monthly" ? "Monthly" : "Weekly"} ⌄
                </GlassPill>
                <RoundArrowButton label="Open deals" onClick={() => navigate("/deals")} />
              </div>
            }
          />
          <div style={{ marginTop: 14 }}>
            <DealFlowChart points={buckets} activeId={activeBar} onSelect={(point) => setActiveBar(point.id)} />
          </div>
        </SectionCard>

        <SectionCard testId="verdict-split-card" tint="split" radius={48} padding={28} style={{ height: 450 }}>
          <SectionHeader
            title="Verdict split"
            subtitle="Deterministic rulings, by verdict"
            action={
              <GlassPill width={140} height={56} active>
                {new Date().toLocaleString("en-US", { month: "short" })}
              </GlassPill>
            }
          />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
            <div style={{ flexShrink: 0 }}>
              <Donut
                segments={segments}
                size={250}
                thickness={34}
                activeId={activeVerdict}
                onSelect={(id) => setActiveVerdict(activeVerdict === id ? null : (id as VerdictSegmentId))}
                centerValue={String(totalCases)}
                centerLabel="Cases"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <DonutLegend
                segments={segments}
                activeId={activeVerdict}
                onSelect={(id) => setActiveVerdict(activeVerdict === id ? null : (id as VerdictSegmentId))}
              />
            </div>
          </div>
          <p style={{ marginTop: 10, fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
            {activeVerdict || activeBar
              ? "Filtering Recent deals — click the selection again to clear it."
              : "Click a segment or a bar to filter Recent deals."}
          </p>
        </SectionCard>
      </div>

      <section style={{ marginTop: 23 }}>
        <SectionCard testId="recent-deals-card" tint="ledger" radius={48} padding={28} style={{ width: 1260 }}>
          <SectionHeader
            title="Recent deals"
            count={visibleDeals.length}
            action={
              <button
                type="button"
                onClick={() => navigate("/deals")}
                style={{ fontSize: 22, color: "rgba(255,255,255,0.72)" }}
              >
                See All ›
              </button>
            }
          />

          <ul style={{ marginTop: 18 }}>
            {visibleDeals.slice(0, 6).map((deal) => {
              const disputed = disputedDeals.has(deal.id);
              const status = statusOf(deal, disputed);
              return (
                <li key={deal.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "66px 1.45fr 150px 1fr 0.9fr 180px 40px",
                      alignItems: "center",
                      gap: 16,
                      width: "100%",
                      padding: "18px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      textAlign: "left",
                    }}
                  >
                    <Avatar name={deal.merchantName} tone="merchant" size={66} onLime />
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
                      mandate #{deal.mandateId.slice(-4)}
                    </span>
                    <Money minor={deal.amountMinor} size={38} weight={500} className="justify-self-end" />
                    <span style={{ justifySelf: "end", color: "rgba(255,255,255,0.5)", fontSize: 24 }}>⋮</span>
                  </button>
                </li>
              );
            })}

            {visibleDeals.length === 0 && (
              <li style={{ padding: "26px 0", fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
                {dealList.length === 0
                  ? "No deals yet. Run Case A to watch a handshake, a guard decision and a dual-signed receipt."
                  : "No deal matches the current filter."}
              </li>
            )}
          </ul>
        </SectionCard>
      </section>
    </PageStage>
  );
}

function KpiCard({
  title,
  minor,
  caption,
  tone,
  delta,
  deltaLabel,
}: {
  title: string;
  minor: number;
  caption: string;
  tone: "income" | "expense";
  delta: PillTone;
  deltaLabel: string;
}) {
  return (
    <SectionCard tint={tone} radius={40} padding={28} style={{ height: 213, position: "relative" }}>
      <h2 className="hs-card-title">{title}</h2>
      <div style={{ marginTop: 12 }}>
        <CountMoney minor={minor} size={64} weight={500} />
      </div>      <p
        style={{
          position: "absolute",
          left: 28,
          bottom: 26,
          maxWidth: 230,
          fontSize: 20,
          lineHeight: 1.3,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        {caption}
      </p>
      <span style={{ position: "absolute", right: 28, bottom: 26 }}>
        <Pill tone={delta} size={17} style={{ height: 44, padding: "0 18px" }}>
          {deltaLabel}
        </Pill>
      </span>
    </SectionCard>
  );
}

export function _unused(): void {
  // no-op
}
