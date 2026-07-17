export type MaybePromise<T> = Promise<T> | T;

export type LogMethod = (...args: any[]) => any;
export interface Logger {
    error: LogMethod;
    warn?: LogMethod;
    warning?: LogMethod;
    info: LogMethod;
    debug: LogMethod;
    child: (...message: any[]) => Logger;
}

type ValidateSelection<T, U> = U extends T ? U : never;
export type PickFromUnion<T, U extends T> = ValidateSelection<T, U>;

export type NullablePartial<TBase, TNullableKey extends keyof TBase = { [K in keyof TBase]: null extends TBase[K] ? K : never }[keyof TBase]> = Partial<
    Pick<TBase, TNullableKey>
> &
    Pick<TBase, Exclude<keyof TBase, TNullableKey>>;

export type Jsonable = string | number | boolean | null | undefined | readonly Jsonable[] | { readonly [key: string]: Jsonable } | { toJSON(): Jsonable };

export type ReplaceInObject<T, From, To> = {
    [K in keyof T]: T[K] extends infer U ? (U extends From ? Exclude<U, From> | To : U) : never;
};

type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Recursively replaces every occurrence of `From` with `To` within `T`, including nested
 * objects and arrays. Unlike {@link ReplaceInObject} (which only rewrites top-level keys),
 * this walks the whole shape. Useful for describing JSON-serialized API payloads where e.g.
 * `Date` values are emitted as ISO strings over the wire.
 */
export type DeepReplace<T, From, To> =
    IsAny<T> extends true
        ? T
        : T extends From
          ? Exclude<T, From> | To
          : T extends (infer U)[]
            ? DeepReplace<U, From, To>[]
            : T extends object
              ? { [K in keyof T]: DeepReplace<T[K], From, To> }
              : T;
