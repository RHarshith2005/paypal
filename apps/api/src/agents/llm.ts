import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { canonicalJson, sha256Hex } from "@handshake/shared";
import type { z } from "zod";
import type { AppConfig } from "../config/env";

export type LlmMode = "live" | "replay";

export type LlmOutcome<T> =
  | { ok: true; value: T; source: LlmMode }
  | { ok: false; reason: string };

export interface ToolCallRequest<T> {
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input. Hand-written so the model's contract is explicit. */
  inputSchema: Record<string, unknown>;
  system: string;
  user: string;
  /** The same contract, enforced locally. A model answer that fails this is discarded. */
  schema: z.ZodType<T>;
  maxTokens?: number;
}

interface CacheRecord {
  version: 1;
  model: string;
  toolName: string;
  requestHash: string;
  recordedAt: string;
  input: unknown;
}

/**
 * Thin wrapper around the Anthropic SDK's tool-use API with a record/replay cache.
 *
 * Every call is single-shot with `tool_choice` pinned to one tool, so the model
 * must answer in the schema we validated. The return value is never trusted
 * directly: callers re-run the deterministic policy or guard over it.
 *
 * The cache is keyed by a hash of the whole request (model, tool, system, user
 * and input schema). Live mode writes a record after every successful call;
 * replay mode only reads, so a recorded demo runs with no network at all. A
 * replay miss is reported as a failure rather than silently going live, because
 * an unrepeatable demo is worse than a visible cache gap.
 */
export class LlmClient {
  private constructor(
    private readonly client: Anthropic | null,
    private readonly model: string,
    readonly mode: LlmMode,
    private readonly cacheDir: string,
  ) {}

  static create(config: AppConfig): LlmClient | null {
    const mode = config.ai.llmMode;
    if (!config.ai.apiKey && mode !== "replay") return null;
    const client = config.ai.apiKey
      ? new Anthropic({ apiKey: config.ai.apiKey, maxRetries: 1, timeout: 20_000 })
      : null;
    return new LlmClient(client, config.ai.model, mode, config.ai.cacheDir);
  }

  get modelId(): string {
    return this.model;
  }

  private requestHash(request: ToolCallRequest<unknown>): string {
    return sha256Hex(
      canonicalJson({
        model: this.model,
        toolName: request.toolName,
        system: request.system,
        user: request.user,
        inputSchema: request.inputSchema,
      }),
    );
  }

  private async readCache(hash: string): Promise<CacheRecord | null> {
    try {
      const raw = await readFile(join(this.cacheDir, `${hash}.json`), "utf8");
      const record = JSON.parse(raw) as CacheRecord;
      return record.requestHash === hash ? record : null;
    } catch {
      return null;
    }
  }

  private async writeCache(hash: string, record: CacheRecord): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(join(this.cacheDir, `${hash}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    } catch {
      // A read-only cache directory must not fail a deal.
    }
  }

  async callTool<T>(request: ToolCallRequest<T>): Promise<LlmOutcome<T>> {
    const hash = this.requestHash(request as ToolCallRequest<unknown>);
    const cached = await this.readCache(hash);
    if (cached) {
      const parsed = request.schema.safeParse(cached.input);
      if (parsed.success) return { ok: true, value: parsed.data, source: "replay" };
      return { ok: false, reason: "cached model output no longer satisfies the tool schema" };
    }

    if (this.mode === "replay") {
      return { ok: false, reason: `replay cache miss for ${request.toolName} (${hash.slice(0, 12)})` };
    }

    if (!this.client) {
      return { ok: false, reason: "no Anthropic credentials configured" };
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 800,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        tools: [
          {
            name: request.toolName,
            description: request.toolDescription,
            // The SDK types the schema as a JSON Schema object.
            input_schema: request.inputSchema as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: request.toolName },
      });

      const block = response.content.find((entry) => entry.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        return { ok: false, reason: "model returned no tool_use block" };
      }

      const parsed = request.schema.safeParse(block.input);
      if (!parsed.success) {
        return {
          ok: false,
          reason: `model output failed validation: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "$"} ${issue.message}`)
            .join("; ")}`,
        };
      }

      await this.writeCache(hash, {
        version: 1,
        model: this.model,
        toolName: request.toolName,
        requestHash: hash,
        recordedAt: new Date().toISOString(),
        input: parsed.data,
      });
      return { ok: true, value: parsed.data, source: "live" };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "model call failed" };
    }
  }
}
