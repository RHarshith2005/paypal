/**
 * Reference geometry.
 *
 * The design was delivered as a 2212×1659 canvas with a device bezel and a
 * 1991×1415 screen. Everything inside the screen is positioned against these
 * numbers so a screenshot at 2212×1659 lands 1:1 on the reference.
 */
export const REF = { width: 2212, height: 1659 } as const;

export const BEZEL = { x: 90, y: 100, width: 2031, height: 1458, radius: 125 } as const;

export const SCREEN = { x: 110, y: 122, width: 1991, height: 1415, radius: 100 } as const;

/** Screen-local layout landmarks, converted from the reference's absolute coords. */
export const LAYOUT = {
  sidePadding: 45,
  rightPadding: 44,
  headerTop: 44,
  headerHeight: 77,
  logoLeft: 45,
  navLeft: 641,
  navWidth: 710,
  iconLeft: 1693,
  iconGap: 88,
  titleTop: 148,
  contentTop: 297,
  contentWidth: 1260,
  railLeft: 1328,
  railTop: 166,
  railWidth: 619,
  railHeight: 1205,
  gap: 23,
} as const;

export const SPEND = {
  state: {
    down: { bg: "#E5555F", fg: "#FFFFFF" },
  },
} as const;

/** Legend order for the verdict donut, as specified. */
export const VERDICT_SEGMENTS = [
  { id: "VALID_PURCHASE", label: "Valid purchase", color: "#FFD84D" },
  { id: "MERCHANT_FAULT", label: "Merchant fault", color: "#FF7AA8" },
  { id: "BUYER_AGENT_OUT_OF_MANDATE", label: "Out of mandate", color: "#C77DFF" },
  { id: "AMBIGUOUS_INTENT", label: "Ambiguous intent", color: "#6B6BF2" },
  { id: "HANDSHAKE_FAILED", label: "Handshake failed", color: "#FF8B5E" },
  { id: "PAYMENT_FAILED", label: "Payment failed", color: "#8EDC8A" },
] as const;

export type VerdictSegmentId = (typeof VERDICT_SEGMENTS)[number]["id"];
