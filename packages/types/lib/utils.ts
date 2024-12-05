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
