import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "./api";

export type ResourceState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "not-found"; data: null; error: null }
  | { status: "error"; data: null; error: string };

export interface Resource<T> {
  state: ResourceState<T>;
  reload: () => void;
}

/** Small data-fetching primitive: no cache, no global store, explicit states. */
export function useResource<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading", data: null, error: null });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });

    loader()
      .then((data) => {
        if (active) setState({ status: "success", data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiClientError) {
          setState(
            error.isNotFound
              ? { status: "not-found", data: null, error: null }
              : { status: "error", data: null, error: error.message },
          );
          return;
        }
        setState({ status: "error", data: null, error: "Unexpected error while loading this view." });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, nonce]);

  return { state, reload };
}
