import { motion, useReducedMotion } from "framer-motion";
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/deals", label: "Deals", end: false },
  { to: "/disputes", label: "Disputes", end: true },
  { to: "/ledger", label: "Ledger", end: false },
] as const;

const TAB_WIDTH = 159;
const TAB_HEIGHT = 55;

/**
 * Glass nav pill with a white active tab and a liquid knob that travels to the
 * tab you pick. Both the pill and the knob share a layoutId, so framer-motion
 * morphs their positions instead of cutting.
 */
export function NavPill() {
  const reduce = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="hs-glass flex items-center justify-between"
      style={{ width: 710, height: 77, borderRadius: 999, padding: 11 }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className="relative flex items-center justify-center"
          style={{ width: TAB_WIDTH, height: TAB_HEIGHT }}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 999,
                    background: "#fff",
                  }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
                />
              )}
              {isActive && (
                <motion.span
                  layoutId="nav-knob"
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: -9,
                    top: TAB_HEIGHT / 2 - 11,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#fff",
                  }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 26, mass: 0.7 }}
                />
              )}
              <span className="hs-nav-label relative" style={{ color: isActive ? "#0B0B0B" : "#FFFFFF", fontSize: 24 }}>
                {tab.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
