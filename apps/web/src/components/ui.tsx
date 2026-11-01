import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "emerald" | "amber" | "zinc" | "sky" | "rose";

const TONE_CLASSES: Record<Tone, string> = {
  emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  zinc: "border-white/10 bg-white/5 text-zinc-300",
  sky: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  rose: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export function Badge({
  children,
  tone = "zinc",
  mono = false,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        TONE_CLASSES[tone]
      } ${mono ? "font-mono tracking-tight" : ""}`}
    >
      {children}
    </span>
  );
}

export function SimulatedTag({ label = "SIMULATED" }: { label?: string }) {
  return (
    <Badge
      tone="amber"
      title="This component is simulated for the demo and does not represent real-world verification."
    >
      {label}
    </Badge>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h2>}
            {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mono-label">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel p-4">
      <p className="mono-label">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] p-8 text-center">
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-400">{description}</p>
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="panel flex items-center gap-3 p-6 text-sm text-zinc-400" role="status" aria-live="polite">
      <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
      {label}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel border-rose-400/25 p-6">
      <p className="text-sm font-medium text-rose-200">{message}</p>
      <p className="mt-1 text-xs text-zinc-400">
        Check that the Handshake API is running on port 8787, then try again.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-400/40 hover:text-white"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="mono-label shrink-0">{label}</dt>
      <dd className="text-sm text-zinc-200 sm:text-right">{children}</dd>
    </div>
  );
}

export function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-zinc-300">{value}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-200"
        aria-label={`Copy ${label ?? "id"}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

export function LinkButton({
  to,
  children,
  tone = "primary",
}: {
  to: string;
  children: ReactNode;
  tone?: "primary" | "ghost";
}) {
  const classes =
    tone === "primary"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
      : "border-white/12 bg-white/[0.03] text-zinc-200 hover:border-white/25 hover:text-white";
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${classes}`}
    >
      {children}
    </Link>
  );
}

export function Button({
  children,
  onClick,
  tone = "primary",
  disabled = false,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "ghost" | "danger" | "amber";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const tones = {
    primary: "border-emerald-400/40 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/20",
    ghost: "border-white/12 bg-white/[0.03] text-zinc-200 hover:border-white/25 hover:text-white",
    danger: "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
  } as const;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Horizontal meter used for budgets, trust scores and liability split. */
export function Meter({
  percent,
  tone = "emerald",
  label,
  value,
}: {
  percent: number;
  tone?: "emerald" | "amber" | "rose" | "sky";
  label?: string;
  value?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const tones = {
    emerald: "bg-gradient-to-r from-emerald-400 to-teal-300",
    amber: "bg-gradient-to-r from-amber-400 to-orange-300",
    rose: "bg-gradient-to-r from-rose-400 to-rose-300",
    sky: "bg-gradient-to-r from-sky-400 to-cyan-300",
  } as const;
  return (
    <div>
      {(label || value) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="mono-label">{label}</span>}
          {value && <span className="font-mono text-[11px] text-zinc-300">{value}</span>}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full ${tones[tone]}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label ?? "progress"}
        />
      </div>
    </div>
  );
}

/** Inline notice with a tone; used for simulated labels and demo warnings. */
export function Callout({
  tone = "amber",
  title,
  children,
}: {
  tone?: "amber" | "rose" | "emerald" | "sky";
  title: ReactNode;
  children?: ReactNode;
}) {
  const tones = {
    amber: "border-amber-400/30 bg-amber-400/5 text-amber-100",
    rose: "border-rose-400/30 bg-rose-400/5 text-rose-100",
    emerald: "border-emerald-400/30 bg-emerald-400/5 text-emerald-100",
    sky: "border-sky-400/30 bg-sky-400/5 text-sky-100",
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-xs leading-relaxed opacity-85">{children}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Tone =
    status === "COMPLETED" ||
    status === "SETTLED" ||
    status === "RULED" ||
    status === "RESOLVED" ||
    status === "RECEIPT_SIGNED"
      ? "emerald"
      : status === "FAILED" || status === "VOIDED"
        ? "rose"
        : status === "RESERVED" || status === "OPEN" || status === "DISPUTED" || status === "HANDSHAKE"
          ? "amber"
          : "sky";
  return (
    <Badge tone={tone} mono>
      {status}
    </Badge>
  );
}
