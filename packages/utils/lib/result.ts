import type { Left, Result, Right } from '@nangohq/types';

export type { Left, Result, Right };

export function Ok<E extends Error>(): Result<void, E>;
export function Ok<T, E extends Error>(value: T): Result<T, E>;
export function Ok<T, E extends Error>(value?: any): Result<T | void, E> {
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

export function Err<T, E extends Error>(error: E): Result<T, E>;
export function Err<T>(error: unknown): Result<T>;
export function Err<T>(error: unknown): Result<T> {
    const err = ensureError(error);
    return {
        error: err,
        unwrap: () => {
            throw err;
        },
        isErr: (): this is Left<T, Error> => true,
        isOk: (): this is Right<T, Error> => false,
        map: <U>(_fn: (value: T) => U): Result<U> => Err(err),
        mapError: <U extends Error>(fn: (e: Error) => U): Result<T, U> => {
            try {
                return Err(fn(err));
            } catch (err) {
                return Err(ensureError(err) as U);
            }
        }
    };
}

function ensureError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}
