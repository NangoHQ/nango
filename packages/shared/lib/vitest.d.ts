export * from 'vitest';

/* eslint-disable @typescript-eslint/no-empty-interface */
interface CustomMatchers<TR = unknown> {
    toBeIsoDate: () => TR;
    toBeIsoDateTimezone: () => TR;
    toBeUUID: () => TR;
}

declare module 'vitest' {
    export interface Assertion<T = any> extends CustomMatchers<T> {}
    export interface AsymmetricMatchersContaining extends CustomMatchers {}
    export interface ExpectStatic<T = any> extends CustomMatchers<T> {}
}

declare module 'ms' {
    export interface StringValue {}
}
