import type { DealListResponse, LedgerList, DisputeList, Health } from "@handshake/shared";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { shortId } from "../lib/format";
import { useResource } from "../lib/useResource";
import { NavPill } from "../ui/NavPill";
import { GooeyFilterDefs, IconButton, Avatar, Pill, Money } from "../ui/primitives";
import { LAYOUT } from "../ui/tokens";

const SEARCH_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.9" />
    <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const BELL_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 3 .7 4.6 1.6 5.7.5.6.1 1.5-.7 1.5H5.6c-.8 0-1.2-.9-.7-1.5.9-1.1 1.6-2.7 1.6-5.7Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M10 19.2a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function Brand() {
  return (
    <Link to="/" aria-label="Handshake dashboard" className="flex items-center" style={{ gap: 16 }}>
      <svg width="60" height="45" viewBox="0 0 60 45" aria-hidden>
        <defs>
          <linearGradient id="brand-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5EDDD1" />
            <stop offset="52%" stopColor="#8FEA9C" />
            <stop offset="100%" stopColor="#CBF47B" />
          </linearGradient>
        </defs>
        <path
          d="M4 19.5 14 9.8l8 5.6 8-5.6L46 19.5l-9 8.2-5.5 6.6-5.6-6.6Z"
          fill="none"
          stroke="url(#brand-mark)"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <circle cx="49.5" cy="33.5" r="4.6" fill="url(#brand-mark)" />
      </svg>
      <span style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1 }}>handshake</span>
    </Link>
  );
}

function RuntimeChip({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <span className="hs-glass" style={{ borderRadius: 999, padding: "10px 18px", fontSize: 16, opacity: 0.7 }}>
        Connecting to the API…
      </span>
    );
  }

  const simulated = health.paypal.simulated || health.agents.runtime === "SIMULATED";
  return (
    <span
      className="hs-glass flex items-center"
      style={{ borderRadius: 999, padding: "10px 18px", fontSize: 16, gap: 10, opacity: 0.86 }}
      title="Runtime mode, exactly as /health reports it"
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#8FEA9C" }} />
      PayPal {health.paypal.fallback ? "mock fallback" : health.paypal.mode}
      <span style={{ opacity: 0.4 }}>·</span>
      {health.agents.dialogue === "LIVE" ? "Live model" : health.agents.dialogue === "REPLAY" ? "Replay" : "Scripted"}
      <span style={{ opacity: 0.4 }}>·</span>
      db:{health.database.driver}
      {simulated && (
        <span style={{ color: "#FFD84D", fontWeight: 600, letterSpacing: "0.04em", fontSize: 14 }}>SIMULATED</span>
      )}
    </span>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const deals = useResource<DealListResponse>(() => api.deals(), []);
  const ledger = useResource<LedgerList>(() => api.ledger(), []);
  const navigate = useNavigate();

  const needle = query.trim().toLowerCase();
  const dealHits = (deals.state.status === "success" ? deals.state.data.deals : []).filter(
    (deal) =>
      needle.length > 0 && (deal.id.toLowerCase().includes(needle) || deal.merchantName.toLowerCase().includes(needle)),
  );
  const ledgerHits = (ledger.state.status === "success" ? ledger.state.data.entries : []).filter(
    (entry) => needle.length > 0 && entry.dealId.toLowerCase().includes(needle),
  );

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,7,24,0.72)",
        backdropFilter: "blur(8px)",
        zIndex: 40,
        paddingTop: 180,
        paddingLeft: 420,
        paddingRight: 420,
      }}
      onClick={onClose}
    >
      <div
        className="hs-tint-rail"
        style={{ borderRadius: 40, padding: 28, border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") {
              if (dealHits[0]) go(`/deals/${dealHits[0].id}`);
              else if (ledgerHits[0]) go(`/deals/${ledgerHits[0].dealId}`);
            }
          }}
          placeholder="Search deals and ledger entries…"
          aria-label="Search deals and ledger entries"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#fff",
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        />
        <p className="hs-caption" style={{ marginTop: 10, fontSize: 18 }}>
          Search covers deal ids, merchant agent names and every ledger entry.
        </p>

        <div style={{ marginTop: 22 }}>
          {needle.length === 0 && (
            <p style={{ fontSize: 20, opacity: 0.55 }}>Type a deal id, a merchant name or an amount reference.</p>
          )}
          {dealHits.slice(0, 5).map((deal) => (
            <button
              key={deal.id}
              type="button"
              onClick={() => go(`/deals/${deal.id}`)}
              className="flex w-full items-center justify-between"
              style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 22 }}
            >
              <span className="flex items-center" style={{ gap: 14 }}>
                <Avatar name={deal.merchantName} tone="merchant" size={44} />
                {deal.merchantName}
                <span className="hs-mono" style={{ opacity: 0.45 }}>
                  {shortId(deal.id, 16)}
                </span>
              </span>
              <Money minor={deal.amountMinor} size={24} />
            </button>
          ))}
          {ledgerHits.slice(0, 4).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => go(`/deals/${entry.dealId}`)}
              className="flex w-full items-center justify-between"
              style={{ padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 22 }}
            >
              <span style={{ opacity: 0.72 }}>Ledger · {entry.status}</span>
              <Money minor={entry.amountMinor} size={24} />
            </button>
          ))}
          {needle.length > 0 && dealHits.length === 0 && ledgerHits.length === 0 && (
            <p style={{ fontSize: 20, opacity: 0.55 }}>No deal or ledger entry matches “{query}”.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function NotificationsOverlay({ onClose }: { onClose: () => void }) {
  const disputes = useResource<DisputeList>(() => api.disputes(), []);
  const items = disputes.state.status === "success" ? disputes.state.data.disputes : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="hs-tint-rail"
      style={{
        position: "absolute",
        right: LAYOUT.rightPadding,
        top: 140,
        width: 560,
        borderRadius: 32,
        padding: 24,
        border: "1px solid rgba(255,255,255,0.1)",
        zIndex: 30,
        maxHeight: 700,
        overflowY: "auto",
      }}
    >
      <p style={{ fontSize: 22, fontWeight: 600 }}>Rulings and guard signals</p>
      <p className="hs-caption" style={{ marginTop: 4, fontSize: 17 }}>
        Verdicts from the dispute court. No notification is invented here.
      </p>
      <ul style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {items.length === 0 && <li style={{ fontSize: 19, opacity: 0.6 }}>No rulings on file yet.</li>}
        {items.map((item) => (
          <li key={item.dispute.id}>
            <Link
              to={`/disputes/${item.dispute.id}`}
              onClick={onClose}
              className="hs-glass flex items-center justify-between"
              style={{ borderRadius: 20, padding: "14px 16px", fontSize: 19 }}
            >
              <span>
                {item.caseLabel ? `Case ${item.caseLabel} · ` : ""}
                {item.dispute.ruling?.verdict?.replaceAll("_", " ") ?? item.dispute.status}
              </span>
              <Pill tone={item.dispute.status === "RULED" ? "success" : "neutral"} size={15}>
                {item.dispute.status}
              </Pill>
            </Link>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function AccountOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="hs-tint-rail"
      style={{
        position: "absolute",
        right: LAYOUT.rightPadding,
        top: 140,
        width: 360,
        borderRadius: 32,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        zIndex: 30,
      }}
    >
      <p style={{ fontSize: 20, fontWeight: 600 }}>Demo principal</p>
      <p className="hs-caption" style={{ fontSize: 16, marginTop: 4 }}>
        SIMULATED identity · local Ed25519 keystore
      </p>
      <div style={{ marginTop: 16, display: "grid", gap: 4 }}>
        {[
          { to: "/mandate", label: "Mandates" },
          { to: "/mandate/new", label: "New mandate" },
          { to: "/trust", label: "Trust scores" },
          { to: "/demo/script", label: "Recording script" },
          { to: "/ledger", label: "Evidence ledger" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClose}
            style={{ padding: "11px 12px", borderRadius: 16, fontSize: 19 }}
            className="hover:bg-white/8"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

export function AppShell() {
  const health = useResource<Health>(() => api.health(), []);
  const [panel, setPanel] = useState<"none" | "search" | "bell" | "account">("none");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel("none");
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "/") {
        event.preventDefault();
        setPanel("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const healthData = health.state.status === "success" ? health.state.data : null;

  const runtime = (
    <div style={{ position: "absolute", left: LAYOUT.sidePadding, bottom: 22 }}>
      <RuntimeChip health={healthData} />
    </div>
  );

  return (
    <>
      <GooeyFilterDefs />

      <header
        style={{
          position: "absolute",
          left: LAYOUT.sidePadding,
          right: LAYOUT.rightPadding,
          top: LAYOUT.headerTop,
          height: LAYOUT.headerHeight,
        }}
        className="flex items-center"
      >
        <Brand />

        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <NavPill />
        </div>

        <div className="ml-auto flex items-center" style={{ gap: 11 }}>
          <span className="relative">
            <IconButton
              label="Search deals and ledger"
              active={panel === "search"}
              onClick={() => setPanel(panel === "search" ? "none" : "search")}
            >
              {SEARCH_ICON}
            </IconButton>
          </span>
          <IconButton
            label="Rulings and guard signals"
            active={panel === "bell"}
            onClick={() => setPanel(panel === "bell" ? "none" : "bell")}
          >
            {BELL_ICON}
          </IconButton>
          <IconButton
            label="Account and demo menu"
            active={panel === "account"}
            onClick={() => setPanel(panel === "account" ? "none" : "account")}
          >
            <AccountGlyph />
          </IconButton>
        </div>
      </header>

      <Outlet />
      {runtime}

      <AnimatePresence>
        {panel === "search" && <SearchOverlay onClose={() => setPanel("none")} />}
        {panel === "bell" && <NotificationsOverlay onClose={() => setPanel("none")} />}
        {panel === "account" && <AccountOverlay onClose={() => setPanel("none")} />}
      </AnimatePresence>
    </>
  );
}

/** Original illustrated account glyph: no photograph, no third-party avatar. */
function AccountGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="17" r="8" fill="currentColor" opacity="0.85" />
      <path d="M8 42c1.6-8.4 8.2-13 16-13s14.4 4.6 16 13Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
