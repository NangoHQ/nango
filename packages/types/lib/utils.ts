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

export type NullablePartial<
    TBase,
    NK extends keyof TBase = { [K in keyof TBase]: null extends TBase[K] ? K : never }[keyof TBase],
    NP = Partial<Pick<TBase, NK>> & Pick<TBase, Exclude<keyof TBase, NK>>
> = { [K in keyof NP]: NP[K] };
