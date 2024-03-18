export * from 'vitest';

/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-namespace */
interface CustomMatchers<TR = unknown> {
    toBeIsoDate: () => TR;
    toBeUUID: () => TR;
}

declare module 'vitest' {
    export interface Assertion<T = any> extends CustomMatchers<T> {}
    export interface AsymmetricMatchersContaining extends CustomMatchers {}
    export interface ExpectStatic<T = any> extends CustomMatchers<T> {}
}
