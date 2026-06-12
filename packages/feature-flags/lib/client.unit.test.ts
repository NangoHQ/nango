import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
}));

const openFeatureClient = vi.hoisted(() => ({
    getBooleanValue: vi.fn(),
    getStringValue: vi.fn(),
    getNumberValue: vi.fn(),
    getObjectValue: vi.fn()
}));

vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => mockLogger)
}));

vi.mock('@openfeature/server-sdk', () => ({
    OpenFeature: {
        setProvider: vi.fn(),
        getClient: vi.fn(() => openFeatureClient),
        setProviderAndWait: vi.fn()
    }
}));

describe('buildFeatureFlagsClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('logs and returns the default when evaluation fails', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getBooleanValue.mockRejectedValue(new Error('provider down'));
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.isEnabled('my-flag', {}, false)).resolves.toBe(false);
        expect(mockLogger.warning).toHaveBeenCalledWith('Feature flag evaluation failed, using default', {
            key: 'my-flag',
            err: expect.any(Error)
        });
    });
});
