export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T> {
    return { ok: true, value };
}
export function err<E extends Error>(errMsg: string): Result<never, E> {
    const e = new Error(errMsg) as E;
    return { ok: false, error: e };
}
