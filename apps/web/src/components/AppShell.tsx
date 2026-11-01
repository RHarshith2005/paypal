import { NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { Badge, SimulatedTag } from "./ui";

const NAV_ITEMS = [
  { to: "/", label: "Overview", end: true },
  { to: "/mandate", label: "Mandate", end: false },
  { to: "/disputes", label: "Dispute court", end: true },
  { to: "/ledger", label: "Ledger", end: false },
  { to: "/trust", label: "Trust", end: false },
  { to: "/demo/script", label: "Demo script", end: false },
] as const;

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0b1019" stroke="rgba(52,211,153,0.35)" />
      <path
        d="M7 12.5 12 8l4 3 4-3 5 4.5-4.5 4L17 20l-3-1.5L9.5 22 7 18.5Z"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RuntimeStatus() {
  const health = useResource(() => api.health(), []);

  if (health.state.status === "loading") {
    return (
      <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="mono-label">Runtime</p>
        <p className="mt-1 text-xs text-zinc-400">Connecting to the API…</p>
      </div>
    );
  }

  if (health.state.status !== "success") {
    return (
      <div className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/5 p-3">
        <p className="mono-label">Runtime</p>
        <p className="mt-1 text-xs text-rose-200">API offline</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">Start it with `pnpm dev:api` on port 8787.</p>
      </div>
    );
  }

  const data = health.state.data;
  return (
    <div className="mt-5 space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <p className="mono-label">Runtime</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={data.paypal.mode === "sandbox" && !data.paypal.fallback ? "emerald" : "amber"}>
          PayPal {data.paypal.fallback ? "mock fallback" : data.paypal.mode}
        </Badge>
        <Badge tone={data.agents.runtime === "MODEL" ? "sky" : "amber"}>
          {data.agents.dialogue === "LIVE"
            ? "Live model"
            : data.agents.dialogue === "REPLAY"
              ? "Replay"
              : "Scripted"}
        </Badge>
        <Badge tone="zinc" mono title={`Database driver: ${data.database.driver}`}>
          db:{data.database.driver}
        </Badge>
      </div>
      <p className="truncate font-mono text-[11px] text-zinc-500" title={data.agents.model}>
        {data.agents.model}
      </p>
      {data.paypal.simulated && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/80">
          <SimulatedTag label="Mock payments" /> no funds move
        </p>
      )}
      {data.paypal.fallback && (
        <p className="text-[11px] leading-relaxed text-amber-200/80">
          The sandbox was unreachable, so the labelled mock adapter took over for new orders.
        </p>
      )}
    </div>
  );
}

export function AppShell() {
  return (
    <div className="app-backdrop min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-400 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-black"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col lg:flex-row">
        <aside className="border-b border-white/8 p-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex items-start gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">Handshake</p>
              <p className="text-[11px] leading-snug text-zinc-500">Trust layer for agent commerce</p>
            </div>
          </div>

          <nav className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 lg:flex-col" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-emerald-400/10 text-emerald-100"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <RuntimeStatus />

          <div className="mt-5 hidden border-t border-white/8 pt-4 lg:block">
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Agent identities, the trust anchor catalogue and mock PayPal captures are labelled{" "}
              <span className="text-amber-200">SIMULATED</span>. Mandate and receipt signatures are real Ed25519
              signatures over canonical JSON.
            </p>
            <p className="mt-3 font-mono text-[10px] tracking-wide text-zinc-600">PayPal AI Hackathon 2026</p>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 p-5 sm:p-8">
          <Outlet />
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4 text-[11px] text-zinc-600">
            <span>Handshake · open-source trust layer · mandate limits enforced in deterministic code</span>
            <span className="font-mono">Ed25519 · SHA-256 · PayPal Orders v2</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
