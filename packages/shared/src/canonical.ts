import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** SHA-256 hex digest of a UTF-8 string. Browser-safe and Node-safe. */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

/**
 * Deterministic canonical JSON: object keys sorted, no whitespace, undefined
 * members dropped, non-finite numbers rejected. All signed payloads use this so
 * that an independent verifier can reproduce the exact byte string.
 *
 * Deliberate simplification of RFC 8785: every numeric field in a signed payload
 * is an integer minor-unit amount or a sequence number, so we do not need the
 * JCS float formatting rules. Non-integers are rejected rather than guessed at.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, []);
}

function serialize(value: unknown, path: string[]): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonicalJson: non-finite number at ${path.join(".") || "$"}`);
    if (!Number.isInteger(value)) throw new Error(`canonicalJson: non-integer number at ${path.join(".") || "$"}`);
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialize(item, [...path, String(i)])).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key], [...path, key])}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported value at ${path.join(".") || "$"}`);
}
