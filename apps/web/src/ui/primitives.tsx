import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Split integer minor units into display parts. USD only, formatted at the edge. */
export function moneyParts(minor: number): { whole: string; cents: string } {
  const safe = Math.max(0, Math.round(minor));
  const whole = Math.floor(safe / 100).toLocaleString("en-US");
  const cents = String(safe % 100).padStart(2, "0");
  return { whole, cents };
}

/**
 * Currency with a superscript symbol and smaller cents, as in the reference.
 * `$2.99` renders as $².⁹⁹ with the symbol at ~40% and the cents at ~58%.
 */
export function Money({
  minor,
  size = 38,
  weight = 600,
  className = "",
  style,
}: {
  minor: number;
  size?: number;
  weight?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { whole, cents } = moneyParts(minor);
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        fontWeight: weight,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <sup style={{ fontSize: Math.round(size * 0.4), lineHeight: 0, marginRight: 1, top: "-0.45em" }}>$</sup>
      {whole}
      <span style={{ fontSize: Math.round(size * 0.58), fontWeight: weight }}>.{cents}</span>
    </span>
  );
}

/** Animated number, honouring prefers-reduced-motion. */
export function useCountUp(value: number, duration = 0.9): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const previous = useRef(0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.22, 0.8, 0.2, 1],
      onUpdate: (next: number) => setShown(next),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return shown;
}

export function CountMoney({ minor, size = 80, weight = 500 }: { minor: number; size?: number; weight?: number }) {
  const shown = useCountUp(minor);
  return <Money minor={shown} size={size} weight={weight} />;
}

export function CountNumber({ value, size = 64, weight = 500 }: { value: number; size?: number; weight?: number }) {
  const shown = useCountUp(value);
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: weight,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {Math.round(shown).toLocaleString("en-US")}
    </span>
  );
}

/** Card header: 36px title with an optional superscript count and a right action. */
export function SectionHeader({
  title,
  count,
  action,
  subtitle,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between" style={{ gap: 16 }}>
      <div>
        <h2 className="hs-card-title flex items-start" style={{ gap: 4 }}>
          {title}
          {count !== undefined && (
            <sup style={{ fontSize: 20, fontWeight: 600, opacity: 0.55, marginTop: -4 }}>{count}</sup>
          )}
        </h2>
        {subtitle && (
          <p className="hs-caption" style={{ marginTop: 6, fontSize: 20 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
          {action}
        </div>
      )}
    </div>
  );
}

const PILL_TONES = {
  up: { background: "#A8E24C", color: "#10210A" },
  down: { background: "#E5555F", color: "#FFFFFF" },
  success: { background: "#B8E85C", color: "#10210A" },
  neutral: { background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.82)" },
  glass: { background: "rgba(255,255,255,0.08)", color: "#FFFFFF" },
  dark: { background: "#0B0B0B", color: "#FFFFFF" },
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function Pill({
  children,
  tone = "neutral",
  size = 18,
  className = "",
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: `${Math.round(size * 0.42)}px ${Math.round(size * 0.86)}px`,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...PILL_TONES[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function IconButton({
  label,
  children,
  onClick,
  active = false,
  size = 77,
  badge,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
      style={{
        width: size,
        height: size,
        background: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.07)",
        color: active ? "#0B0B0B" : "#fff",
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 20,
            height: 20,
            borderRadius: 999,
            background: "#E5555F",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "grid",
            placeItems: "center",
            padding: "0 5px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

const AVATAR_TONES: Record<string, [string, string]> = {
  buyer: ["#6F78E6", "#5560C9"],
  merchant: ["#6FDDD2", "#C5F37C"],
  anchor: ["#F7A07F", "#F58B6B"],
  violet: ["#B592F7", "#8B7BEA"],
  neutral: ["#4A4F6E", "#33374F"],
};

export function initialsOf(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "HS";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

export function Avatar({
  name,
  tone = "neutral",
  size = 66,
  ring,
  onLime = false,
}: {
  name: string;
  tone?: keyof typeof AVATAR_TONES;
  size?: number;
  ring?: string;
  onLime?: boolean;
}) {
  const [from, to] = AVATAR_TONES[tone] ?? AVATAR_TONES.neutral!;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(140deg, ${from}, ${to})`,
        border: ring ? `3px solid ${ring}` : "none",
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        letterSpacing: "-0.02em",
        color: onLime ? "#10210A" : "#0B0B0B",
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Hidden SVG filter used by the gooey buttons. Rendered once per page. */
export function GooeyFilterDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <filter id="hs-goo-filter">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * White pill with a concentric circle joined by a gooey neck. The blobs live
 * inside the filter; the label is drawn outside it so text stays crisp.
 */
export function GooeyButton({
  label,
  onClick,
  width = 235,
  height = 76,
  background = "#FFFFFF",
  foreground = "#0B0B0B",
  icon,
  ariaLabel,
}: {
  label: ReactNode;
  onClick?: () => void;
  width?: number;
  height?: number;
  background?: string;
  foreground?: string;
  icon?: ReactNode;
  ariaLabel?: string;
}) {
  const reduce = useReducedMotion();
  const pillWidth = width - 38;
  return (
    <motion.div
      style={{ position: "relative", width, height }}
      whileHover={reduce ? undefined : { scale: 1.015 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
    >
      <div className="hs-goo" style={{ position: "absolute", inset: 0 }} aria-hidden>
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: pillWidth,
            height,
            borderRadius: height / 2,
            background,
          }}
        />
        <motion.span
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: height,
            height,
            borderRadius: "50%",
            background,
          }}
          whileHover={reduce ? undefined : { x: 5 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        />
        <span
          style={{
            position: "absolute",
            left: pillWidth - 26,
            top: height / 2 - 13,
            width: 60,
            height: 26,
            borderRadius: 13,
            background,
          }}
        />
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="absolute inset-0 flex items-center justify-between"
        style={{ color: foreground, paddingLeft: 34, paddingRight: 22, fontSize: 24, fontWeight: 500 }}
      >
        <span style={{ letterSpacing: "-0.01em" }}>{label}</span>
        {icon && (
          <span
            style={{
              width: height - 22,
              height: height - 22,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: foreground,
            }}
          >
            {icon}
          </span>
        )}
      </button>
    </motion.div>
  );
}

/** Small glass pill used for period switches and top-right controls. */
export function GlassPill({
  children,
  onClick,
  width = 163,
  height = 56,
  active = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  width?: number;
  height?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hs-glass transition-colors"
      style={{
        width,
        height,
        borderRadius: height / 2,
        fontSize: 20,
        fontWeight: 500,
        color: active ? "#0B0B0B" : "#fff",
        background: active ? "#fff" : "rgba(255,255,255,0.06)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

export function RoundArrowButton({
  onClick,
  label,
  size = 54,
  children,
}: {
  onClick?: () => void;
  label: string;
  size?: number;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
      style={{ width: size, height: size, background: "#fff", color: "#0B0B0B" }}
    >
      {children ?? (
        <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 17 17 7M9 7h8v8"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
