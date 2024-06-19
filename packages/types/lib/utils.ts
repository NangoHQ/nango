export type MaybePromise<T> = Promise<T> | T;

export type LogMethod = (...args: any[]) => any;
export interface Logger {
    error: LogMethod;
    warn: LogMethod;
    info: LogMethod;
    debug: LogMethod;
    child: (...message: any[]) => Logger;
}
