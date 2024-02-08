export type ResultRes<T> = { ok: true; res: T };
export type ResultErr<E extends Error> = { ok: false; err: E };
export type Result<T, E extends Error = Error> = ResultRes<T> | ResultErr<E>;
export function ok<T>(res: T): ResultRes<T> {
    return { ok: true, res };
}
export function err<E extends Error>(errMsg: string): ResultErr<E> {
    const e = new Error(errMsg) as E;
    return { ok: false, err: e };
}
export function isOk<T, E extends Error>(result: Result<T, E>): result is ResultRes<T> {
    return result.ok;
}
export function isErr<T, E extends Error>(result: Result<T, E>): result is ResultErr<E> {
    return !result.ok;
}
