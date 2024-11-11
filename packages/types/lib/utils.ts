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
