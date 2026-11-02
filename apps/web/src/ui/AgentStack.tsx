import { motion, useReducedMotion } from "framer-motion";
import { Pill } from "./primitives";

export interface AgentCardModel {
  id: string;
  name: string;
  role: string;
  tone: "anchor" | "merchant" | "buyer";
  score: number | null;
  grade: string | null;
  keyId: string | null;
  mandateExpiry: string | null;
  simulated: boolean;
}

const GRADIENTS: Record<AgentCardModel["tone"], string> = {
  anchor: "linear-gradient(135deg, #F7A07F 0%, #F58B6B 100%)",
  merchant: "linear-gradient(135deg, #6FDDD2 0%, #C5F37C 100%)",
  buyer: "linear-gradient(135deg, #B592F7 0%, #8B7BEA 100%)",
};

const ON_CARD: Record<AgentCardModel["tone"], string> = {
  anchor: "#3A1710",
  merchant: "#10210A",
  buyer: "#1B1330",
};

/** Display suffix of a real key id: the last four characters, masked. */
export function tailOf(keyId: string | null): string {
  if (!keyId) return "•••• ••••";
  const clean = keyId.replace(/[^A-Za-z0-9]/g, "");
  return `•••• ${clean.slice(-4).toUpperCase()}`;
}

/**
 * Stacked agent cards. The back cards are coloured slabs showing only a title
 * and a masked key tail (the visible peek is too short for more); the glass
 * front card carries the selected agent's real key id, role and mandate expiry.
 */
export function AgentStack({
  agents,
  selectedId,
  onSelect,
}: {
  agents: AgentCardModel[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  const others = agents.filter((agent) => agent.id !== selected?.id);

  return (
    <div style={{ position: "relative", height: 520 }}>
      {others.map((agent, index) => (
        <motion.button
          key={agent.id}
          type="button"
          onClick={() => onSelect(agent.id)}
          aria-label={`Bring ${agent.name} to the front`}
          layout={!reduce}
          style={{
            position: "absolute",
            left: index * 8,
            right: index * 8,
            top: index * 54,
            height: 96,
            borderRadius: 40,
            background: GRADIENTS[agent.tone],
            color: ON_CARD[agent.tone],
            textAlign: "left",
            padding: "18px 28px 0",
            zIndex: index + 1,
            overflow: "hidden",
          }}
        >
          <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {agent.name}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {agent.simulated && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(11,11,11,0.18)",
                    whiteSpace: "nowrap",
                  }}
                >
                  SIMULATED
                </span>
              )}
              <span
                className="hs-mono"
                style={{ fontSize: 15, opacity: 0.6, letterSpacing: "0.08em", whiteSpace: "nowrap" }}
              >
                {tailOf(agent.keyId)}
              </span>
            </span>
          </span>
        </motion.button>
      ))}

      {selected && (
        <motion.div
          key={selected.id}
          layout={!reduce}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 240,
            height: 240,
            borderRadius: "100px 40px 40px 40px",
            background: "linear-gradient(150deg, #6F78E6 0%, #5560C9 100%)",
            color: "#FFFFFF",
            padding: 32,
            zIndex: 9,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span
              style={{
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={selected.name}
            >
              {selected.name}
            </span>
            <span style={{ fontSize: 17, opacity: 0.72, whiteSpace: "nowrap" }}>{selected.role}</span>
          </div>

          <p
            className="hs-mono"
            title={selected.keyId ?? "No signed key id yet"}
            style={{
              marginTop: 18,
              fontSize: 20,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              opacity: 0.94,
            }}
          >
            {selected.keyId ?? "no signed key yet"}
          </p>
          <p style={{ marginTop: 4, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
            Ed25519 key id · latest signed receipt
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            <span style={{ fontSize: 17, opacity: 0.75 }}>
              {selected.mandateExpiry ? `Mandate expires ${selected.mandateExpiry}` : "No active mandate"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {selected.grade && (
                <Pill tone={selected.grade === "HIGH" ? "up" : "neutral"} size={14}>
                  {selected.score ?? "—"} · {selected.grade}
                </Pill>
              )}
              {selected.simulated && (
                <Pill tone="neutral" size={13}>
                  SIMULATED
                </Pill>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
