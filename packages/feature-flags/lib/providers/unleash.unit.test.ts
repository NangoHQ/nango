import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@openfeature/server-sdk';

const unleashInstance = vi.hoisted(() => {
    const listeners = new Map<string, Set<(err?: Error) => void>>();
    return {
        listeners,
        isSynchronized: vi.fn(() => false),
        on: vi.fn((event: string, fn: (err?: Error) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(fn);
        }),
        once: vi.fn(),
        removeListener: vi.fn((event: string, fn: (err?: Error) => void) => {
            listeners.get(event)?.delete(fn);
        }),
        emit: (event: string) => {
            listeners.get(event)?.forEach((fn) => fn());
        },
        isEnabled: vi.fn((_flag: string, _ctx: unknown, defaultValue: boolean) => defaultValue),
        getVariant: vi.fn(),
        destroy: vi.fn()
    };
});

vi.mock('unleash-client', () => ({
    initialize: vi.fn(() => unleashInstance)
}));

vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }))
}));

const mockLogger = {} as Logger;

describe('UnleashProvider context mapping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        unleashInstance.listeners.clear();
        unleashInstance.isSynchronized.mockReturnValue(false);
    });

    it('passes currentTime as a native Date to unleash', async () => {
        unleashInstance.isSynchronized.mockReturnValue(true);
        const { UnleashProvider } = await import('./unleash.js');
        const provider = new UnleashProvider({ url: 'http://unleash.local/api', appName: 'nango' });
        const currentTime = new Date('2024-06-01T12:00:00.000Z');

        await provider.resolveBooleanEvaluation('example-flag', false, { currentTime }, mockLogger);

        expect(unleashInstance.isEnabled).toHaveBeenCalledWith('example-flag', expect.objectContaining({ currentTime }), false);
    });

    it('serializes Date properties as ISO strings', async () => {
        unleashInstance.isSynchronized.mockReturnValue(true);
        const { UnleashProvider } = await import('./unleash.js');
        const provider = new UnleashProvider({ url: 'http://unleash.local/api', appName: 'nango' });
        const rolloutAt = new Date('2024-06-01T12:00:00.000Z');

        await provider.resolveBooleanEvaluation('example-flag', false, { rolloutAt }, mockLogger);

        expect(unleashInstance.isEnabled).toHaveBeenCalledWith(
            'example-flag',
            expect.objectContaining({
                properties: { rolloutAt: '2024-06-01T12:00:00.000Z' }
            }),
            false
        );
    });

    it('returns DEFAULT reason when unleash is not synchronized', async () => {
        vi.useFakeTimers();
        unleashInstance.isSynchronized.mockReturnValue(false);
        const { UnleashProvider } = await import('./unleash.js');
        const provider = new UnleashProvider({ url: 'http://unleash.local/api', appName: 'nango', initTimeoutMs: 0 });
        await vi.advanceTimersByTimeAsync(0);
        const result = await provider.resolveBooleanEvaluation('example-flag', false, {}, mockLogger);
        expect(result).toEqual({ value: false, reason: 'DEFAULT' });
        vi.useRealTimers();
    });

    it('recovers evaluations after unleash synchronizes in the background', async () => {
        vi.useFakeTimers();
        const { UnleashProvider } = await import('./unleash.js');
        const provider = new UnleashProvider({ url: 'http://unleash.local/api', appName: 'nango', initTimeoutMs: 0 });
        await vi.advanceTimersByTimeAsync(0);

        const beforeSync = await provider.resolveBooleanEvaluation('example-flag', false, {}, mockLogger);
        expect(beforeSync).toEqual({ value: false, reason: 'DEFAULT' });

        unleashInstance.isSynchronized.mockReturnValue(true);
        unleashInstance.isEnabled.mockReturnValue(true);
        unleashInstance.emit('synchronized');

        const afterSync = await provider.resolveBooleanEvaluation('example-flag', false, {}, mockLogger);
        expect(afterSync).toEqual({ value: true, reason: 'TARGETING_MATCH' });
        vi.useRealTimers();
    });
});
