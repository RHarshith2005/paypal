import type { ApiError } from "@handshake/shared";
import type { FastifyError, FastifyInstance } from "fastify";

/** Marker so tests can assert on stable machine-readable codes. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: string | null = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const toApiError = (code: string, message: string, details: string | null): ApiError => ({
  error: { code, message, details },
});

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(toApiError("ROUTE_NOT_FOUND", `No route matches ${request.method} ${request.url}`, null));
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send(toApiError(error.code, error.message, error.details));
      return;
    }
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    reply
      .status(statusCode)
      .send(
        toApiError(
          statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
          statusCode >= 500 ? "Unexpected server error" : error.message,
          null,
        ),
      );
  });
}
