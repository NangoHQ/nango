const MAX_LENGTH = 600;

/**
 * `VIOLATED_CONSTRAINT` and format-parse errors quote the offending row back, and the audit blob holds the
 * actor's email and IP — logging one verbatim would copy that into logs with none of the audit store's
 * controls. Everything diagnostic precedes the quoted row, so cutting from there keeps the error useful.
 */
export function sanitizeClickhouseError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    const cut = message.search(/Column values:|Cannot parse input:/);
    const sanitized = cut === -1 ? message : `${message.slice(0, cut).trimEnd()} [row omitted]`;
    return sanitized.length > MAX_LENGTH ? `${sanitized.slice(0, MAX_LENGTH)}…` : sanitized;
}
