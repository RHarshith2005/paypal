import type { DemoCase } from "@handshake/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Callout, LinkButton, Meter, PageHeader, Panel } from "../components/ui";
import { api, ApiClientError } from "../lib/api";

interface Beat {
  id: string;
  at: string;
  title: string;
  say: string;
  show: string;
  cue?: DemoCase | "RESET";
}

const BEATS: Beat[] = [
  {
    id: "hook",
    at: "0:00",
    title: "The problem",
    say: "Agents can already negotiate and pay. What they cannot do is prove a human authorised it, or what exactly both sides agreed to.",
    show: "Overview — the three-step pipeline cards and the signed-mandate preview.",
  },
  {
    id: "mandate",
    at: "0:20",
    title: "A human signs a mandate",
    say: "This is the envelope my procurement agent has to stay inside: a lifetime cap, a per-item cap, allowed categories, forbidden substitutions, an expiry and a single-use nonce.",
    show: "Mandate builder — change the per-item cap and let the live preview and validation react.",
    cue: "RESET",
  },
  {
    id: "handshake",
    at: "0:50",
    title: "Both sides prove legitimacy",
    say: "A trust anchor issues short-lived attestations bound to the mandate hash and the catalog hash. Both agents verify signature, expiry, binding and a fresh nonce pair before a price is mentioned. This anchor is simulated — the signatures are real.",
    show: "Deal page — the handshake chips and the 15 recorded checks.",
    cue: "A",
  },
  {
    id: "negotiation",
    at: "1:15",
    title: "Negotiation, bounded by code",
    say: "The merchant model phrases the offer. The policy code decides the floor price. The buyer model phrases the response, and the guard decides whether it is allowed to spend.",
    show: "Deal page — buyer and merchant turns, guard decision under each buyer turn.",
  },
  {
    id: "payment",
    at: "1:40",
    title: "PayPal settles it",
    say: "The order carries an idempotency key derived from the deal id, so a retry cannot double-charge. Then both agents sign the receipt, and the receipt commits to the transcript root.",
    show: "Deal page — payment panel, then press Verify in browser on the receipt.",
  },
  {
    id: "caseB",
    at: "2:05",
    title: "The failure mode is evidence",
    say: "Same pipeline, but this agent was misconfigured and the guard is bypassed. Watch the bypass appear in the transcript before the money moves.",
    show: "Deal page for Case B — amber banner, DEMO-BYPASS-00, capture above the signed cap.",
    cue: "B",
  },
  {
    id: "court",
    at: "2:30",
    title: "Arbitration reads the packet",
    say: "Case A: the delivery record defeats the claim. Case B: the buyer agent acted outside its mandate, so the merchant refunds in full. Neither verdict needs a model to decide liability.",
    show: "Dispute court — both verdicts side by side, liability meters, drafted responses.",
  },
  {
    id: "close",
    at: "2:50",
    title: "Why it matters",
    say: "Handshake is the missing trust layer: a signed mandate, a provable handshake, a real payment and a receipt either side can verify without trusting the other.",
    show: "Trust scoreboard — recomputable scores, then the ledger tamper demo.",
  },
];

const STORAGE_KEY = "handshake.demo.progress";

function readProgress(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.min(BEATS.length, Math.max(0, parsed)) : 0;
  } catch {
    return 0;
  }
}

export function DemoScreenplayPage() {
  const navigate = useNavigate();
  const [done, setDone] = useState(readProgress);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (value: number) => {
    setDone(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Progress is a convenience; storage may be unavailable.
    }
  };

  const cue = async (beat: Beat) => {
    if (!beat.cue) return;
    setBusy(beat.id);
    setError(null);
    setMessage(null);
    try {
      if (beat.cue === "RESET") {
        const result = await api.resetDemo();
        setMessage(`Reset and reseeded ${result.seeded.length} cases.`);
        navigate("/mandate/new");
      } else {
        const run = await api.runDemo(beat.cue);
        setMessage(`Case ${run.caseLabel} running — ${run.label}`);
        navigate(`/deals/${run.dealId}`);
      }
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "The demo action failed.");
    } finally {
      setBusy(null);
    }
  };

  const percent = (done / BEATS.length) * 100;
  const current = BEATS[Math.min(done, BEATS.length - 1)];

  return (
    <div>
      <PageHeader
        eyebrow="Screen recording"
        title="Three minutes, eight beats"
        description="Narration, what to have on screen, and one button per beat so the run is repeatable. Progress is stored in this browser."
        actions={
          <LinkButton to="/" tone="ghost">
            Overview
          </LinkButton>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Panel title="Progress" description="Advance a beat each time you finish one.">
          <Meter percent={percent} label="Beats recorded" value={`${done} / ${BEATS.length}`} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => persist(Math.min(BEATS.length, done + 1))} disabled={done >= BEATS.length}>
              Mark beat done
            </Button>
            <Button tone="ghost" onClick={() => persist(Math.max(0, done - 1))} disabled={done === 0}>
              Back one
            </Button>
            <Button tone="ghost" onClick={() => persist(0)}>
              Restart script
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">
            Next up: <span className="text-zinc-300">{done >= BEATS.length ? "all beats recorded" : current?.title}</span>
          </p>
        </Panel>

        <Panel title="Pre-flight" description="Two commands before you hit record.">
          <ol className="space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
            <li>
              <code className="font-mono text-emerald-200">pnpm dev</code> — API on 8787, web on 5173.
            </li>
            <li>
              <code className="font-mono text-emerald-200">pnpm demo:reset</code> — or press Reset below, so Case A and
              Case B are fresh.
            </li>
            <li>Browser at 1440×900, zoom 100%, notifications off.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tone="amber" onClick={() => void cue(BEATS[1]!)} disabled={busy !== null}>
              {busy === BEATS[1]!.id ? "Resetting…" : "Reset demo data"}
            </Button>
          </div>
        </Panel>
      </div>

      {message && (
        <div className="mb-4">
          <Callout tone="emerald" title="Done">
            {message}
          </Callout>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Callout tone="rose" title="Demo action failed">
            {error}
          </Callout>
        </div>
      )}

      <ol className="space-y-3">
        {BEATS.map((beat, index) => {
          const state = index < done ? "done" : index === done ? "current" : "upcoming";
          return (
            <li
              key={beat.id}
              className={`rounded-xl border p-4 transition ${
                state === "current"
                  ? "border-emerald-400/40 bg-emerald-400/[0.04]"
                  : state === "done"
                    ? "border-white/6 bg-white/[0.015] opacity-70"
                    : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-zinc-500">{beat.at}</span>
                <Badge tone={state === "current" ? "emerald" : state === "done" ? "zinc" : "sky"} mono>
                  {state}
                </Badge>
                <h2 className="text-sm font-semibold text-zinc-100">{beat.title}</h2>
                {beat.cue && (
                  <span className="ml-auto">
                    <Button
                      tone="ghost"
                      onClick={() => void cue(beat)}
                      disabled={busy !== null}
                    >
                      {busy === beat.id ? "Working…" : beat.cue === "RESET" ? "Reset + open builder" : `Run Case ${beat.cue}`}
                    </Button>
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-300">“{beat.say}”</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">On screen: {beat.show}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
        If the PayPal sandbox is unreachable, new orders fall back to the mock adapter and the shell shows a “mock
        fallback” badge. The recording should mention it rather than hide it.
      </p>
    </div>
  );
}
