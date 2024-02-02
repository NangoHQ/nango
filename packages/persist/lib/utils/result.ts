export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export type ResultValue<T> = { ok: true; value: T };
export type ResultError<E extends Error> = { ok: false; error: E };
export function ok<T>(value: T): ResultValue<T> {
    return { ok: true, value };
}
export function err<E extends Error>(errMsg: string): ResultError<E> {
    const e = new Error(errMsg) as E;
    return { ok: false, error: e };
}
