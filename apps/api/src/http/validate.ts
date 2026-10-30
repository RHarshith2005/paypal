import { z } from "zod";
import { HttpError } from "./errors";

/** Validate an untrusted boundary value and convert failures into a 400. */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "INVALID_REQUEST", `${label} failed validation`, z.prettifyError(result.error));
  }
  return result.data;
}
