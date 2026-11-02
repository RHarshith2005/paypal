import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "emerald" | "amber" | "zinc" | "sky" | "rose";

const TONE_CLASSES: Record<Tone, string> = {
  emerald: "border-[#CBF47B]/35 bg-[#CBF47B]/12 text-[#EAFBC0]",
  amber: "border-[#FFD84D]/35 bg-[#FFD84D]/12 text-[#FFE9A3]",
  zinc: "border-white/12 bg-white/6 text-white/78",
  sky: "border-[#8FB3F7]/35 bg-[#8FB3F7]/12 text-[#D6E4FF]",
  rose: "border-[#E5555F]/40 bg-[#E5555F]/12 text-[#FFD5D8]",
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
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
    <section
      className={`rounded-[32px] border border-white/8 bg-[#1F2135] p-[22px] ${className}`}
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[22px] font-medium leading-tight tracking-[-0.02em] text-white">{title}</h2>}
            {description && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-white/55">{description}</p>}
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
        <h1 className="mt-2 text-[40px] font-medium leading-[1.02] tracking-[-0.02em] text-white">{title}</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/55">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[28px] border border-white/7 bg-white/4 p-[20px]">
      <p className="mono-label">{label}</p>
      <p className="mt-2 font-mono text-[28px] font-medium tracking-tight text-white">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-white/45">{hint}</p>}
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
    <div className="rounded-[24px] border border-dashed border-white/14 bg-white/3 p-7 text-center">
      <h3 className="text-[16px] font-medium text-white/85">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-white/50">{description}</p>
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[24px] border border-white/7 bg-[#1F2135] p-5 text-[15px] text-white/60"
      role="status"
      aria-live="polite"
    >
      <span className="h-3 w-3 animate-pulse rounded-full bg-[#CBF47B]" />
      {label}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#E5555F]/30 bg-[#E5555F]/8 p-5">
      <p className="text-[15px] font-medium text-[#FFD5D8]">{message}</p>
      <p className="mt-1 text-[13px] text-white/50">
        Check that the Handshake API is running on port 8787, then try again.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-white/18 px-4 py-2 text-[13px] font-medium text-white transition hover:border-[#CBF47B]/50"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/6 py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="mono-label shrink-0">{label}</dt>
      <dd className="text-[14px] text-white/85 sm:text-right">{children}</dd>
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
      <code className="rounded-lg bg-black/40 px-2 py-1 font-mono text-[13px] text-white/80">{value}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-full border border-white/12 px-2.5 py-1 text-[12px] font-medium text-white/55 transition hover:border-[#CBF47B]/50 hover:text-[#EAFBC0]"
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
      ? "border-[#CBF47B]/40 bg-[#CBF47B]/14 text-[#EAFBC0] hover:bg-[#CBF47B]/24"
      : "border-white/14 bg-white/4 text-white/80 hover:border-white/30 hover:text-white";
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition ${classes}`}
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
    primary: "border-[#CBF47B]/40 bg-[#CBF47B]/14 text-[#EAFBC0] hover:bg-[#CBF47B]/24",
    ghost: "border-white/14 bg-white/4 text-white/80 hover:border-white/30 hover:text-white",
    danger: "border-[#E5555F]/45 bg-[#E5555F]/12 text-[#FFD5D8] hover:bg-[#E5555F]/22",
    amber: "border-[#FFD84D]/45 bg-[#FFD84D]/12 text-[#FFE9A3] hover:bg-[#FFD84D]/22",
  } as const;
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
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
    emerald: "bg-gradient-to-r from-[#5EDDD1] to-[#CBF47B]",
    amber: "bg-gradient-to-r from-[#FFD84D] to-[#FF8B5E]",
    rose: "bg-gradient-to-r from-[#E5555F] to-[#FF7AA8]",
    sky: "bg-gradient-to-r from-[#6B6BF2] to-[#8FB3F7]",
  } as const;
  return (
    <div>
      {(label || value) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="mono-label">{label}</span>}
          {value && <span className="font-mono text-[12px] text-white/75">{value}</span>}
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
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
    amber: "border-[#FFD84D]/30 bg-[#FFD84D]/7 text-[#FFE9A3]",
    rose: "border-[#E5555F]/32 bg-[#E5555F]/7 text-[#FFD5D8]",
    emerald: "border-[#CBF47B]/30 bg-[#CBF47B]/7 text-[#EAFBC0]",
    sky: "border-[#8FB3F7]/30 bg-[#8FB3F7]/7 text-[#D6E4FF]",
  } as const;
  return (
    <div className={`rounded-[24px] border p-4 ${tones[tone]}`}>
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">{title}</p>
      {children && <div className="mt-1 text-[13px] leading-relaxed opacity-85">{children}</div>}
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
        : status === "RESERVED" ||
            status === "OPEN" ||
            status === "DISPUTED" ||
            status === "HANDSHAKE" ||
            status === "PAID" ||
            status === "PAYMENT_PENDING"
          ? "amber"
          : "sky";
  return (
    <Badge tone={tone} mono>
      {status}
    </Badge>
  );
}
