import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnvs = {
    NANGO_FLAG_PROVIDER: 'noop' as 'noop' | 'unleash',
    NANGO_UNLEASH_URL: undefined as string | undefined,
    NANGO_UNLEASH_API_TOKEN: undefined as string | undefined,
    NANGO_UNLEASH_APP_NAME: 'nango',
    NANGO_UNLEASH_REFRESH_INTERVAL_MS: 30_000
};

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

const { unleashMockState, unleashInstances } = vi.hoisted(() => ({
    unleashMockState: {
        readyEvent: 'synchronized' as 'synchronized' | 'error',
        readyDelayMs: 0
    },
    unleashInstances: [] as { destroy: ReturnType<typeof vi.fn> }[]
}));

vi.mock('unleash-client', () => {
    return {
        initialize: vi.fn(() => {
            const instance = {
                on: vi.fn(),
                once: vi.fn((event: string, fn: (err?: Error) => void) => {
                    if (event !== unleashMockState.readyEvent) return;
                    const fire = () => fn(event === 'error' ? new Error('boom') : undefined);
                    if (unleashMockState.readyDelayMs > 0) {
                        setTimeout(fire, unleashMockState.readyDelayMs);
                    } else {
                        queueMicrotask(fire);
                    }
                }),
                isEnabled: vi.fn(() => true),
                destroy: vi.fn()
            };
            unleashInstances.push(instance);
            return instance;
        })
    };
});

describe('getFeatureFlagsClient', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockEnvs.NANGO_FLAG_PROVIDER = 'noop';
        mockEnvs.NANGO_UNLEASH_URL = undefined;
        mockEnvs.NANGO_UNLEASH_API_TOKEN = undefined;
        unleashMockState.readyEvent = 'synchronized';
        unleashMockState.readyDelayMs = 0;
        unleashInstances.length = 0;
        vi.resetModules();
        const { destroy } = await import('./index.js');
        await destroy();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the default value with the noop provider', async () => {
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', { 'account.uuid': 'abc' }, true)).resolves.toBe(true);
        await expect(client.isEnabled('any-flag', { 'account.uuid': 'abc' }, false)).resolves.toBe(false);
    });

    it('falls back to noop when unleash is selected but url is missing', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', {}, true)).resolves.toBe(true);
        expect(warn).toHaveBeenCalled();
    });

    it('uses unleash provider when configured', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        mockEnvs.NANGO_UNLEASH_API_TOKEN = 'token';
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', { 'account.uuid': 'abc' }, false)).resolves.toBe(true);
    });

    it('resolves initialize() when unleash emits error before synchronized', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.readyEvent = 'error';
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', {}, false)).resolves.toBe(true);
        errSpy.mockRestore();
    });

    it('serializes destroy() called during initialization', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.readyDelayMs = 30;
        vi.resetModules();
        const { getFeatureFlagsClient, destroy } = await import('./index.js');
        const initPromise = getFeatureFlagsClient();
        const destroyPromise = destroy();
        const [client] = await Promise.all([initPromise, destroyPromise]);
        // The first instance was destroyed as part of the swap to NOOP.
        expect(unleashInstances[0]?.destroy).toHaveBeenCalledTimes(1);
        // After destroy, isEnabled should still resolve (now backed by NOOP -> default).
        await expect(client.isEnabled('any-flag', {}, false)).resolves.toBe(false);
    });

    it('rebuilds a fresh provider after destroy/recreate', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { getFeatureFlagsClient, destroy } = await import('./index.js');
        const first = await getFeatureFlagsClient();
        await destroy();
        const second = await getFeatureFlagsClient();
        expect(second).not.toBe(first);
        // Two unleash instances were created (one per recreate).
        expect(unleashInstances.length).toBe(2);
        // The first unleash instance was torn down by the destroy/swap.
        expect(unleashInstances[0]?.destroy).toHaveBeenCalledTimes(1);
        await expect(second.isEnabled('any-flag', {}, false)).resolves.toBe(true);
    });
});
