/*
By convention Left represents a failed computation
And Right represents a successful one
*/
export interface Left<T, E extends Error, P = unknown> {
    error: E;
    payload?: P;
    isErr(this: Result<T, E, P>): this is Left<T, E, P>;
    isOk(this: Result<T, E, P>): this is Right<T, E, P>;
    unwrap(): T;
    map<U>(fn: (value: T) => U): Result<T, E, P>;
}

export interface Right<T, E extends Error, P = unknown> {
    value: T;
    isErr(this: Result<T, E, P>): this is Left<T, E, P>;
    isOk(this: Result<T, E, P>): this is Right<T, E, P>;
    unwrap(): T;
    map<U>(fn: (value: T) => U): Result<U, E, P>;
}

export type Result<T, E extends Error = Error, P = unknown> = Left<T, E, P> | Right<T, E, P>;

export function Ok<T, E extends Error, P = unknown>(value: T): Result<T, E, P> {
    return {
        value,
        unwrap: () => value,
        isErr: () => false,
        isOk: () => true,
        map: <U>(fn: (value: T) => U): Result<U, E, P> => {
            try {
                return Ok(fn(value));
            } catch (error) {
                return Err(error as E);
            }
        }
    };
}

export function Err<T, E extends Error, P = unknown>(error: E | string, payload?: P): Result<T, E, P> {
    return {
        error: typeof error === 'string' ? (new Error(error) as E) : error,
        payload: payload as P,
        unwrap: () => {
            throw error as Error;
        },
        isErr: () => true,
        isOk: () => false,
        map: <U>(_fn: (value: T) => U): Result<T, E, P> => {
            return Err(error, payload);
        }
    };
}
