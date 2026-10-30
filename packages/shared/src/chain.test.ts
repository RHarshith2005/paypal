import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { appendEvidence, chainRoot, entryDigest, GENESIS_HASH, verifyChain, type EvidenceEntry } from "./chain";

describe("canonicalJson", () => {
  it("sorts keys so signatures do not depend on insertion order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("drops undefined members and keeps nulls", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("rejects non-integer numbers instead of guessing a float encoding", () => {
    expect(() => canonicalJson({ amount: 1.5 })).toThrow(/non-integer/);
  });

  it("is stable across repeated serialisation", () => {
    const value = { z: [1, 2, { b: true, a: "x" }], a: "y" };
    expect(canonicalJson(value)).toBe(canonicalJson(value));
  });
});

const at = (seconds: number): string => `2026-03-01T00:00:0${seconds}.000Z`;

const buildChain = (): EvidenceEntry[] => {
  const first = appendEvidence([], {
    signer: "agt_buyer_01",
    timestamp: at(0),
    type: "HANDSHAKE",
    payload: { nonce: "nonce-1" },
  });
  const second = appendEvidence([first], {
    signer: "agt_merchant_ridgeway",
    timestamp: at(1),
    type: "OFFER",
    payload: { amountMinor: 15_000 },
  });
  const third = appendEvidence([first, second], {
    signer: "agt_buyer_01",
    timestamp: at(2),
    type: "ACCEPT",
    payload: { amountMinor: 15_000 },
  });
  return [first, second, third];
};

describe("evidence ledger", () => {
  it("accepts a well-formed chain and reports its root", () => {
    const chain = buildChain();
    const verification = verifyChain(chain);

    expect(verification.valid).toBe(true);
    expect(verification.brokenAt).toBeNull();
    expect(verification.reason).toBeNull();
    expect(verification.root).toBe(chainRoot(chain));
    expect(verification.root).toBe(chain[2]!.payloadHash);
  });

  it("starts at GENESIS with a linked prevHash on every entry", () => {
    const chain = buildChain();
    expect(chain[0]!.prevHash).toBe(GENESIS_HASH);
    expect(chain[1]!.prevHash).toBe(chain[0]!.payloadHash);
    expect(chain[2]!.prevHash).toBe(chain[1]!.payloadHash);
    expect(chain.map((entry) => entry.seq)).toEqual([0, 1, 2]);
  });

  it("pinpoints a tampered payload at the edited index", () => {
    const chain = buildChain();
    chain[1] = { ...chain[1]!, payload: { amountMinor: 900 } };

    const verification = verifyChain(chain);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
    expect(verification.reason).toMatch(/payloadHash mismatch at index 1/);
  });

  it("detects reordered entries", () => {
    const chain = buildChain();
    const reordered = [chain[0]!, chain[2]!, chain[1]!];

    const verification = verifyChain(reordered);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
  });

  it("still detects a reorder when the entries are renumbered and relinked", () => {
    const chain = buildChain();
    const moved = chain[2]!;
    const forged: EvidenceEntry = {
      ...moved,
      seq: 1,
      prevHash: chain[0]!.payloadHash,
    };

    expect(entryDigest(forged)).not.toBe(forged.payloadHash);
    const verification = verifyChain([chain[0]!, forged]);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
    expect(verification.reason).toMatch(/payloadHash mismatch/);
  });

  it("detects a deleted entry", () => {
    const chain = buildChain();
    const withHole = [chain[0]!, chain[2]!];

    const verification = verifyChain(withHole);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
    expect(verification.reason).toMatch(/sequence gap at index 1/);
  });

  it("reports the index of an entry whose signature does not verify", () => {
    const chain = buildChain();
    const verification = verifyChain(chain, {
      verifyEntry: (entry) => entry.seq !== 2,
    });

    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(2);
    expect(verification.reason).toMatch(/signature invalid at index 2/);
  });

  it("treats an empty chain as valid with the GENESIS root", () => {
    const verification = verifyChain([]);
    expect(verification.valid).toBe(true);
    expect(verification.root).toBe(GENESIS_HASH);
  });
});
