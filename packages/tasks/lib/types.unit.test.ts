import { describe, expect, it } from 'vitest';

import { DEFAULT_TASK_OPTIONS, resolveTaskOptions } from './types.js';

describe('resolveTaskOptions', () => {
    it('falls back to defaults when nothing is provided', () => {
        expect(resolveTaskOptions({})).toEqual(DEFAULT_TASK_OPTIONS);
    });

    it('uses definition values over defaults', () => {
        const resolved = resolveTaskOptions({ retryMax: 7, groupMaxConcurrency: 2 });
        expect(resolved.retryMax).toBe(7);
        expect(resolved.groupMaxConcurrency).toBe(2);
        expect(resolved.heartbeatTimeoutSecs).toBe(DEFAULT_TASK_OPTIONS.heartbeatTimeoutSecs);
    });

    it('uses overrides over both definition and defaults', () => {
        const resolved = resolveTaskOptions({ retryMax: 7 }, { retryMax: 1, createdToStartedTimeoutSecs: 42 });
        expect(resolved.retryMax).toBe(1);
        expect(resolved.createdToStartedTimeoutSecs).toBe(42);
    });

    it('falls back to the definition for fields the overrides omit', () => {
        const resolved = resolveTaskOptions({ retryMax: 7 }, { createdToStartedTimeoutSecs: 42 });
        expect(resolved.retryMax).toBe(7);
        expect(resolved.createdToStartedTimeoutSecs).toBe(42);
    });
});
