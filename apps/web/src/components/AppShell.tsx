import { NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { useResource } from "../lib/useResource";
import { Badge, SimulatedTag } from "./ui";

const NAV_ITEMS = [
  { to: "/", label: "Overview", end: true },
  { to: "/mandate", label: "Mandate", end: false },
  { to: "/ledger", label: "Ledger", end: false },
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
      <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="mono-label">Runtime</p>
        <p className="mt-1 text-xs text-zinc-400">Connecting to the API…</p>
      </div>
    );
  }

  if (health.state.status !== "success") {
    return (
      <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/5 p-3">
        <p className="mono-label">Runtime</p>
        <p className="mt-1 text-xs text-rose-200">API offline</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">Start it with `pnpm dev:api` on port 8787.</p>
      </div>
    );
  }

  const healthData = health.state.data;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <p className="mono-label">Runtime</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={healthData.paypal.mode === "sandbox" ? "emerald" : "amber"}>PayPal {healthData.paypal.mode}</Badge>
        <Badge tone={healthData.agents.runtime === "MODEL" ? "sky" : "amber"}>
          {healthData.agents.runtime === "MODEL" ? "Model" : "Scripted"} agents
        </Badge>
        <Badge tone="zinc" mono title={`Database driver: ${healthData.database.driver}`}>
          db:{healthData.database.driver}
        </Badge>
      </div>
      <p className="font-mono text-[11px] text-zinc-500">{healthData.agents.model}</p>
      {healthData.paypal.simulated && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/80">
          <SimulatedTag label="Mock payments" /> no funds move
        </p>
      )}
    </div>
  );
}

export function AppShell() {
  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
        <aside className="border-b border-white/8 p-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-start gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">Handshake</p>
              <p className="text-[11px] leading-snug text-zinc-500">Trust layer for agent commerce</p>
            </div>
          </div>

          <nav className="mt-6 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-xs font-medium transition ${
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

          <div className="mt-6 hidden border-t border-white/8 pt-4 lg:block">
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Agent identities and mock PayPal captures are labelled <span className="text-amber-200">SIMULATED</span>.
              Mandate and receipt signatures are real Ed25519 signatures over canonical JSON.
            </p>
            <p className="mt-3 font-mono text-[10px] tracking-wide text-zinc-600">PayPal AI Hackathon 2026</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <Outlet />
          <footer className="mt-10 border-t border-white/8 pt-4 text-[11px] text-zinc-600">
            Handshake · open-source trust layer · mandate limits enforced in deterministic code
          </footer>
        </main>
      </div>
    </div>
  );
}
