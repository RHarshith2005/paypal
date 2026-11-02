import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BEZEL, LAYOUT, REF, SCREEN } from "./tokens";

/** `?frame=1` renders the full 2212×1659 stage so screenshots align 1:1. */
export function useFrameMode(): boolean {
  const location = useLocation();
  return new URLSearchParams(location.search).get("frame") === "1";
}

/**
 * The design is a fixed reference surface, scaled by transform.
 *
 * 1:1 at 2212×1659 in frame mode (scale 1) and at 1991×1415 in app mode, which
 * is what the reference canvas describes. Scaling rather than reflowing keeps
 * every measured geometry identical at any window size.
 */
function useStageScale(frame: boolean): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const measure = () => {
      const width = frame ? REF.width : SCREEN.width;
      const height = frame ? REF.height : SCREEN.height;
      const next = Math.min(window.innerWidth / width, window.innerHeight / height);
      setScale(Math.max(0.34, Math.min(1, next)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [frame]);

  return scale;
}

function StageCanvas({ frame, children }: { frame: boolean; children: ReactNode }) {
  const scale = useStageScale(frame);
  const width = frame ? REF.width : SCREEN.width;
  const height = frame ? REF.height : SCREEN.height;
  const surface: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width,
    height,
    transform: `translate(-50%, -50%) scale(${scale})`,
    transformOrigin: "center center",
  };

  if (!frame) {
    return (
      <div style={surface} className="hs-screen-app">
        {children}
      </div>
    );
  }

  return (
    <div className="hs-backdrop">
      <div style={surface}>
        <div
          className="hs-bezel"
          style={{ left: BEZEL.x, top: BEZEL.y, width: BEZEL.width, height: BEZEL.height }}
          aria-hidden
        />
        <div
          className="hs-screen"
          style={{ left: SCREEN.x, top: SCREEN.y, width: SCREEN.width, height: SCREEN.height }}
        >
          {children}
        </div>
        {import.meta.env.DEV && <ReferenceOverlay />}
      </div>
    </div>
  );
}

/**
 * Dev-only overlay: press O to toggle /design/reference.webp over the stage and
 * drag the opacity slider to compare. Missing file is reported, not faked.
 */
function ReferenceOverlay() {
  const [open, setOpen] = useState(false);
  const [opacity, setOpacity] = useState(0.45);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "o" || event.key === "O") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {missing ? (
            <div
              style={{
                position: "absolute",
                left: 400,
                top: 640,
                width: 1412,
                padding: 32,
                borderRadius: 32,
                background: "rgba(5,7,24,0.92)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "#fff",
                fontSize: 22,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ fontSize: 26 }}>reference.webp not found</strong>
              <p style={{ marginTop: 8, opacity: 0.7 }}>
                Save the reference canvas to <code className="hs-mono">apps/web/public/design/reference.webp</code> and
                press O again. The stage, the diff script and every measurement in{" "}
                <code className="hs-mono">ui/tokens.ts</code> are already keyed to 2212×1659.
              </p>
            </div>
          ) : (
            <img
              src="/design/reference.webp"
              alt="Reference design overlay"
              onError={() => setMissing(true)}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: REF.width,
                height: REF.height,
                opacity,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              left: 90,
              top: 40,
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 18px",
              borderRadius: 999,
              background: "rgba(5,7,24,0.86)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#fff",
              fontSize: 16,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>REFERENCE</span>
            <input
              aria-label="Reference opacity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              style={{ width: 220, accentColor: "#CBF47B" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>{Math.round(opacity * 100)}%</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ color: "rgba(255,255,255,0.6)", fontSize: 15 }}
            >
              O to hide
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Root surface: backdrop + bezel + screen, or the bezel-less app surface. */
export function AppSurface() {
  const frame = useFrameMode();
  return (
    <StageCanvas frame={frame}>
      <Outlet />
    </StageCanvas>
  );
}

/**
 * Page frame inside the screen: H1 at the reference position, a scrolling main
 * column with the scrollbar hidden, and an optional right rail that starts
 * higher than the content, exactly as in the reference.
 */
export function PageStage({
  title,
  titleAccessory,
  right,
  overlay,
  children,
  contentTop = LAYOUT.contentTop,
}: {
  title: string;
  titleAccessory?: ReactNode;
  right?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
  contentTop?: number;
}) {
  const contentRight = right ? LAYOUT.sidePadding + LAYOUT.railWidth + LAYOUT.gap : LAYOUT.rightPadding;

  return (
    <>
      <div
        style={{ position: "absolute", left: LAYOUT.sidePadding, top: LAYOUT.titleTop, width: LAYOUT.contentWidth }}
        className="flex items-end"
      >
        <h1 className="hs-h1">{title}</h1>
        {titleAccessory && <div style={{ marginLeft: 18, paddingBottom: 12 }}>{titleAccessory}</div>}
      </div>

      <div
        className="hs-scroll"
        style={{
          position: "absolute",
          left: LAYOUT.sidePadding,
          top: contentTop,
          right: contentRight,
          bottom: 0,
        }}
      >
        <div style={{ paddingBottom: 90 }}>{children}</div>
      </div>

      {right && (
        <aside
          data-testid="page-rail"
          style={{
            position: "absolute",
            left: LAYOUT.railLeft,
            top: LAYOUT.railTop,
            width: LAYOUT.railWidth,
            height: LAYOUT.railHeight,
          }}
        >
          {right}
        </aside>
      )}

      {overlay}
    </>
  );
}

/** Shared page shell for the secondary screens (Deals, Disputes, Ledger). */
/**
 * Shell for the dense secondary screens.
 *
 * Those pages were authored at ~1268px with 12–14px type. The stage surface is
 * 1991px wide, so they are zoomed 1.5× to keep their original density instead
 * of looking like a shrunken screenshot.
 */
export function SubPageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="hs-scroll"
      style={{ position: "absolute", left: LAYOUT.sidePadding, right: LAYOUT.rightPadding, top: 150, bottom: 0 }}
    >
      <div style={{ zoom: 1.5, paddingBottom: 70 }}>{children}</div>
    </div>
  );
}

/** Shared card surface used inside the secondary screens. */
export function SectionCard({
  children,
  tint = "rail",
  radius = 40,
  padding = 28,
  className = "",
  style,
  testId,
}: {
  children: ReactNode;
  tint?: "rail" | "revenue" | "split" | "ledger" | "glass" | "income" | "expense";
  radius?: number;
  padding?: number;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  const tintClass = {
    rail: "hs-tint-rail",
    revenue: "hs-tint-revenue",
    split: "hs-tint-split",
    ledger: "hs-tint-ledger",
    glass: "hs-glass",
    income: "hs-tint-income",
    expense: "hs-tint-expense",
  }[tint];

  return (
    <div
      data-testid={testId}
      className={`${tintClass} ${className}`}
      style={{ borderRadius: radius, padding, border: "1px solid rgba(255,255,255,0.06)", ...style }}
    >
      {children}
    </div>
  );
}

/** Stable id helper for list keys and aria labels. */
export function useStableId(prefix: string): string {
  const ref = useRef(`${prefix}-${Math.random().toString(36).slice(2, 8)}`);
  return ref.current;
}
