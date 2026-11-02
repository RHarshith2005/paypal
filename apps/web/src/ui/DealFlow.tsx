import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Money } from "./primitives";

export interface FlowPoint {
  id: string;
  label: string;
  count: number;
  valueMinor: number;
  deltaPercent: number | null;
}

const BAR_MAX = 172;
const BAR_MIN = 129;

/**
 * Five hand-built bars: rounded, bottoms aligned, minimum height so an empty
 * period still reads as a period. The active bar takes a lighter fill and a
 * ring marker near its top; its tooltip shows the real amount and delta.
 */
export function DealFlowChart({
  points,
  activeId,
  onSelect,
}: {
  points: FlowPoint[];
  activeId: string | null;
  onSelect: (point: FlowPoint) => void;
}) {
  const reduce = useReducedMotion();
  const peak = Math.max(1, ...points.map((point) => point.count));
  const active = points.find((point) => point.id === activeId) ?? null;
  const activeIndex = active ? points.findIndex((point) => point.id === active.id) : -1;

  return (
    <div style={{ position: "relative", paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 11, height: BAR_MAX + 34 }}>
        {points.map((point) => {
          const height = Math.max(BAR_MIN, Math.round((point.count / peak) * BAR_MAX));
          const isActive = point.id === activeId;
          return (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point)}
              aria-pressed={isActive}
              aria-label={`${point.label}: ${point.count} deals`}
              style={{ position: "relative", width: 103, height, display: "flex", alignItems: "flex-end" }}
            >
              <motion.span
                initial={reduce ? false : { height: 0 }}
                animate={{ height }}
                transition={{ duration: reduce ? 0 : 0.75, ease: [0.22, 0.8, 0.2, 1] }}
                style={{
                  display: "block",
                  width: "100%",
                  borderRadius: 30,
                  background: isActive ? "#D9B8FF" : "#8D7AA6",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 14,
                    transform: "translateX(-50%)",
                    fontSize: 24,
                    fontWeight: 500,
                    color: isActive ? "#1B1330" : "rgba(255,255,255,0.86)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {point.count}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 52,
                      width: 46,
                      height: 46,
                      marginLeft: -23,
                      borderRadius: "50%",
                      border: "7px solid #FFFFFF",
                    }}
                  />
                )}
              </motion.span>
            </button>
          );
        })}

        {active && activeIndex >= 0 && (
          <div
            style={{
              position: "absolute",
              left: activeIndex * (103 + 11) + 51,
              top: 0,
              transform: "translateX(-50%)",
              width: 181,
              height: 80,
              borderRadius: 24,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(14px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 2,
              paddingLeft: 16,
              pointerEvents: "none",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "3px 7px",
                  borderRadius: 999,
                  background: "rgba(203,244,123,0.16)",
                  color: "#CBF47B",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ▲ {active.deltaPercent === null ? "—" : `${Math.abs(active.deltaPercent)}%`}
              </span>
              <Money minor={active.valueMinor} size={24} weight={600} />
            </span>
            <span style={{ fontSize: 17, color: "rgba(255,255,255,0.6)" }}>{active.label} settled volume</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 11, marginTop: 16 }}>
        {points.map((point) => (
          <span
            key={point.id}
            style={{
              width: 103,
              textAlign: "center",
              fontSize: 20,
              color: point.id === activeId ? "#FFFFFF" : "rgba(255,255,255,0.62)",
            }}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CardAction({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{children}</div>;
}
