import type { Left, Result, Right } from '@nangohq/types';

export type { Left, Result, Right };

// Note that `Error` in this file refers specifically to the ES5 Error interface.
// - Not to the ES2022 Error interface.
// - Not to the builtin Error class.

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
    if (err === null || err === undefined) {
        return new Error();
    }
    if (isError(err)) {
        return err;
    }
    if (typeof err === 'object') {
        return new Error(JSON.stringify(err));
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return new Error(String(err));
}

function isError(value: any): value is Error {
    if (value instanceof Error) {
        return true;
    }
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return 'name' in value && typeof value.name === 'string' && 'message' in value && typeof value.message === 'string';
}
