import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@openfeature/server-sdk';

const unleashInstance = vi.hoisted(() => ({
    isSynchronized: vi.fn(() => true),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    isEnabled: vi.fn(() => true),
    getVariant: vi.fn(),
    destroy: vi.fn()
}));

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
        unleashInstance.isSynchronized.mockReturnValue(true);
    });

    it('passes currentTime as a native Date to unleash', async () => {
        const { UnleashProvider } = await import('./unleash.js');
        const provider = new UnleashProvider({ url: 'http://unleash.local/api', appName: 'nango' });
        const currentTime = new Date('2024-06-01T12:00:00.000Z');

        await provider.resolveBooleanEvaluation('example-flag', false, { currentTime }, mockLogger);

        expect(unleashInstance.isEnabled).toHaveBeenCalledWith('example-flag', expect.objectContaining({ currentTime }), false);
    });

    it('serializes Date properties as ISO strings', async () => {
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
});
