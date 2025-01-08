/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/*
By convention Left represents a failed computation
And Right represents a successful one
*/
export interface Left<T, E extends Error> {
    error: E;
    isErr(this: Result<T, E>): this is Left<T, E>;
    isOk(this: Result<T, E>): this is Right<T, E>;
    unwrap(): T;
    map<U>(fn: (value: T) => U): Result<T, E>;
    mapError<U extends Error>(fn: (error: E) => U): Result<T, U>;
}

export interface Right<T, E extends Error> {
    value: T;
    isErr(this: Result<T, E>): this is Left<T, E>;
    isOk(this: Result<T, E>): this is Right<T, E>;
    unwrap(): T;
    map<U>(fn: (value: T) => U): Result<U, E>;
    mapError<U extends Error>(fn: (error: E) => U): Result<T, U>;
}

export type Result<T, E extends Error = Error> = Left<T, E> | Right<T, E>;

export function Ok<T, E extends Error>(value: T): Result<T, E> {
    return {
        value,
        unwrap: () => value,
        isErr: (): this is Left<T, E> => false,
        isOk: (): this is Right<T, E> => true,
        map: <U>(fn: (value: T) => U): Result<U, E> => {
            try {
                return Ok(fn(value));
            } catch (err) {
                return Err(err as E);
            }
        },
        mapError: <U extends Error>(_fn: (error: E) => U): Result<T, U> => {
            return Ok(value);
        }
    };
}

export function Err<T, E extends Error>(error: E | string): Result<T, E> {
    return {
        error: typeof error === 'string' ? (new Error(error) as E) : error,
        unwrap: () => {
            throw error as Error;
        },
        isErr: (): this is Left<T, E> => true,
        isOk: (): this is Right<T, E> => false,
        map: <U>(_fn: (value: T) => U): Result<T, E> => {
            return Err(error);
        },
        mapError: <U extends Error>(fn: (error: E) => U): Result<T, U> => {
            try {
                return Err(fn(typeof error === 'string' ? (new Error(error) as E) : error));
            } catch (err) {
                return Err(err as U);
            }
        }
    };
}
