export interface ResultRes<T> {
    ok: true;
    res: T;
}
export interface ResultErr<E extends Error> {
    ok: false;
    err: E;
}
export type Result<T, E extends Error = Error> = ResultRes<T> | ResultErr<E>;

export function resultOk<T>(res: T): ResultRes<T> {
    return { ok: true, res };
}
export function resultErr<E extends Error>(e: Error | string): ResultErr<E> {
    if (e instanceof Error) {
        return { ok: false, err: e as E };
    } else {
        return { ok: false, err: new Error(e) as E };
    }
}
export function isOk<T, E extends Error>(result: Result<T, E>): result is ResultRes<T> {
    return result.ok;
}
export function isErr<T, E extends Error>(result: Result<T, E>): result is ResultErr<E> {
    return !result.ok;
}
