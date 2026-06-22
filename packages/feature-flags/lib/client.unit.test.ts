import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
}));

const mockIncrement = vi.hoisted(() => vi.fn());

const openFeatureClient = vi.hoisted(() => ({
    getBooleanValue: vi.fn(),
    getStringValue: vi.fn(),
    getNumberValue: vi.fn(),
    getObjectValue: vi.fn()
}));

vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => mockLogger),
    metrics: {
        increment: mockIncrement,
        Types: {
            FEATURE_FLAGS_EVALUATED: 'nango.feature_flags.evaluated'
        }
    }
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
        expect(mockIncrement).toHaveBeenCalledWith('nango.feature_flags.evaluated', 1, {
            flag: 'my-flag',
            type: 'boolean',
            used_default: 'true',
            result: 'false'
        });
    });

    it('records evaluation metric on success', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getBooleanValue.mockResolvedValue(true);
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.isEnabled('oauth-state-cookie-enforcement', { targetingKey: 'uuid1' }, false)).resolves.toBe(true);
        expect(mockIncrement).toHaveBeenCalledWith('nango.feature_flags.evaluated', 1, {
            flag: 'oauth-state-cookie-enforcement',
            type: 'boolean',
            result: 'true'
        });
    });

    it('records string evaluations without result tag', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getStringValue.mockResolvedValue('new-ui');
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.getString('ui-variant', {}, 'old-ui')).resolves.toBe('new-ui');
        expect(mockIncrement).toHaveBeenCalledWith('nango.feature_flags.evaluated', 1, {
            flag: 'ui-variant',
            type: 'string'
        });
    });

    it('omits result tag for number evaluations', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getNumberValue.mockResolvedValue(42);
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.getNumber('rate-limit', {}, 10)).resolves.toBe(42);
        expect(mockIncrement).toHaveBeenCalledWith('nango.feature_flags.evaluated', 1, {
            flag: 'rate-limit',
            type: 'number'
        });
    });

    it('returns the evaluated value when telemetry fails', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getBooleanValue.mockResolvedValue(true);
        mockIncrement.mockImplementation(() => {
            throw new Error('dogstatsd down');
        });
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.isEnabled('my-flag', {}, false)).resolves.toBe(true);
        expect(mockLogger.warning).not.toHaveBeenCalled();
    });

    it('returns the default when evaluation fails and telemetry fails', async () => {
        const { buildFeatureFlagsClient } = await import('./client.js');
        const { NoopProvider } = await import('./providers/noop.js');
        openFeatureClient.getBooleanValue.mockRejectedValue(new Error('provider down'));
        mockIncrement.mockImplementation(() => {
            throw new Error('dogstatsd down');
        });
        const client = buildFeatureFlagsClient(new NoopProvider());
        await expect(client.isEnabled('my-flag', {}, false)).resolves.toBe(false);
        expect(mockLogger.warning).toHaveBeenCalledWith('Feature flag evaluation failed, using default', {
            key: 'my-flag',
            err: expect.any(Error)
        });
    });
});
