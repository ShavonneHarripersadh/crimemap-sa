/**
 * Data functions return a result rather than throwing, so every page can render a loading,
 * empty or error state without a try/catch in the component tree.
 */

export type DataResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DataError };

export interface DataError {
  readonly kind: "not_configured" | "query_failed" | "not_found";
  readonly message: string;
}

export function ok<T>(data: T): DataResult<T> {
  return { ok: true, data };
}

export function fail<T>(kind: DataError["kind"], message: string): DataResult<T> {
  return { ok: false, error: { kind, message } };
}

export const NOT_CONFIGURED_MESSAGE =
  "The crime database is not configured for this environment.";
