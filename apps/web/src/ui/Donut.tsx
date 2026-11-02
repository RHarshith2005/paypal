import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Hand-built SVG donut: rounded segment caps, small gaps, draw-in on mount.
 * No chart library — the geometry is a stroke on a circle.
 */
export function Donut({
  segments,
  size = 276,
  thickness = 36,
  activeId,
  onSelect,
  centerLabel = "Total",
  centerValue,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  centerLabel?: string;
  centerValue: string;
}) {
  const reduce = useReducedMotion();
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 7;
  const filterId = useId().replace(/:/g, "");

  let cursor = 0;
  const arcs = segments.map((segment) => {
    const share = total > 0 ? Math.max(0, segment.value) / total : 0;
    const full = share * circumference;
    const dash = Math.max(0, full - gap);
    const offset = cursor;
    cursor += full;
    return { ...segment, share, dash, offset };
  });

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel}: ${centerValue}`}
      >
        <defs>
          <filter id={`glow-${filterId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} filter={`url(#glow-${filterId})`}>
          {arcs.map((arc) => {
            const dimmed = activeId !== null && activeId !== undefined && activeId !== arc.id;
            return (
              <motion.circle
                key={arc.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${arc.dash} ${circumference}`}
                strokeDashoffset={-arc.offset}
                initial={reduce ? false : { opacity: 0, strokeDasharray: `0 ${circumference}` }}
                animate={{ opacity: dimmed ? 0.28 : 1 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 0.8, 0.2, 1] }}
                style={{ cursor: onSelect && arc.value > 0 ? "pointer" : "default" }}
                onClick={() => arc.value > 0 && onSelect?.(arc.id)}
                aria-label={`${arc.label}: ${arc.value}`}
              />
            );
          })}
        </g>
      </svg>

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 30, color: "rgba(255,255,255,0.62)", lineHeight: 1 }}>{centerLabel}</p>
          <p style={{ fontSize: 52, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 4 }}>{centerValue}</p>
        </div>
      </div>
    </div>
  );
}

export function DonutLegend({
  segments,
  activeId,
  onSelect,
}: {
  segments: DonutSegment[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14, rowGap: 14 }}>
      {segments.map((segment) => {
        const dimmed = activeId !== null && activeId !== undefined && activeId !== segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => segment.value > 0 && onSelect?.(segment.id)}
            aria-pressed={activeId === segment.id}
            style={{ textAlign: "left", opacity: dimmed ? 0.5 : 1, cursor: segment.value > 0 ? "pointer" : "default" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 4, height: 18, borderRadius: 999, background: segment.color, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 16,
                  color: "rgba(255,255,255,0.82)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {segment.label}
              </span>
            </span>
            <span style={{ display: "block", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 2 }}>
              {segment.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
