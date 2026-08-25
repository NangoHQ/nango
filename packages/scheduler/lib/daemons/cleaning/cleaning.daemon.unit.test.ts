import { describe, expect, it } from 'vitest';

import { CleaningDaemon } from './cleaning.daemon.js';

import type knex from 'knex';

const fakeArgs = {
    db: {} as knex.Knex,
    abortSignal: new AbortController().signal,
    tickIntervalMs: 1000,
    onError: () => {}
};

describe('CleaningDaemon constructor', () => {
    it('should reject negative olderThanDays', () => {
        expect(() => new CleaningDaemon({ ...fakeArgs, olderThanDays: -1 })).toThrow(/non-negative integer/);
    });
    it('should reject non-integer olderThanDays', () => {
        expect(() => new CleaningDaemon({ ...fakeArgs, olderThanDays: 1.5 })).toThrow();
    });
    it('should reject NaN olderThanDays', () => {
        expect(() => new CleaningDaemon({ ...fakeArgs, olderThanDays: NaN })).toThrow();
    });
    it('should accept 0', () => {
        expect(() => new CleaningDaemon({ ...fakeArgs, olderThanDays: 0 })).not.toThrow();
    });
    it('should accept positive integer', () => {
        expect(() => new CleaningDaemon({ ...fakeArgs, olderThanDays: 5 })).not.toThrow();
    });
});
