import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnvs = {
    NANGO_FLAG_PROVIDER: 'noop' as 'noop' | 'unleash',
    NANGO_UNLEASH_URL: undefined as string | undefined,
    NANGO_UNLEASH_API_TOKEN: undefined as string | undefined,
    NANGO_UNLEASH_APP_NAME: 'nango',
    NANGO_UNLEASH_REFRESH_INTERVAL_MS: 30_000,
    NANGO_UNLEASH_INIT_TIMEOUT_MS: 100
};

vi.mock('./env.js', () => ({
    envs: mockEnvs
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as Record<string, unknown>),
        getLogger: vi.fn(() => ({
            info: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        }))
    };
});

const { unleashMockState, unleashInstances } = vi.hoisted(() => ({
    unleashMockState: {
        readyEvent: 'ready' as 'ready' | 'synchronized' | 'never',
        readyDelayMs: 0,
        failNextInit: 0
    },
    unleashInstances: [] as { destroy: ReturnType<typeof vi.fn>; isEnabled: ReturnType<typeof vi.fn> }[]
}));

vi.mock('unleash-client', () => {
    return {
        initialize: vi.fn(() => {
            if (unleashMockState.failNextInit > 0) {
                unleashMockState.failNextInit -= 1;
                throw new Error('init failed');
            }
            const listeners = new Map<string, Set<(err?: Error) => void>>();
            const instance = {
                isSynchronized: vi.fn(() => false),
                on: vi.fn((event: string, fn: (err?: Error) => void) => {
                    if (!listeners.has(event)) listeners.set(event, new Set());
                    listeners.get(event)!.add(fn);
                }),
                once: vi.fn((event: string, fn: (err?: Error) => void) => {
                    const wrapper = (err?: Error) => {
                        instance.removeListener(event, wrapper);
                        fn(err);
                    };
                    instance.on(event, wrapper);
                    if (unleashMockState.readyEvent === 'never' || event !== unleashMockState.readyEvent) return;
                    const fire = () => wrapper(undefined);
                    if (unleashMockState.readyDelayMs > 0) {
                        setTimeout(fire, unleashMockState.readyDelayMs);
                    } else {
                        queueMicrotask(fire);
                    }
                }),
                removeListener: vi.fn((event: string, fn: (err?: Error) => void) => {
                    listeners.get(event)?.delete(fn);
                }),
                isEnabled: vi.fn((_flag: string, _ctx: unknown, defaultValue: boolean) => defaultValue),
                getVariant: vi.fn(() => ({ name: 'v0', enabled: true, feature_enabled: true, payload: { type: 'string', value: 'new-ui' } })),
                destroy: vi.fn()
            };
            unleashInstances.push(instance);
            return instance;
        })
    };
});

describe('getFeatureFlagsClient', () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        mockEnvs.NANGO_FLAG_PROVIDER = 'noop';
        mockEnvs.NANGO_UNLEASH_URL = undefined;
        mockEnvs.NANGO_UNLEASH_API_TOKEN = undefined;
        mockEnvs.NANGO_UNLEASH_REFRESH_INTERVAL_MS = 30_000;
        mockEnvs.NANGO_UNLEASH_INIT_TIMEOUT_MS = 100;
        unleashMockState.readyEvent = 'ready';
        unleashMockState.readyDelayMs = 0;
        unleashMockState.failNextInit = 0;
        unleashInstances.length = 0;
    });

    afterEach(async () => {
        const { destroy } = await import('./index.js');
        await destroy();
        vi.resetModules();
        vi.restoreAllMocks();
        vi.useRealTimers();
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
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', {}, true)).resolves.toBe(true);
    });

    it('uses unleash provider when configured', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        mockEnvs.NANGO_UNLEASH_API_TOKEN = 'token';
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        unleashInstances[0]!.isEnabled.mockReturnValue(true);
        await expect(client.isEnabled('any-flag', { 'account.uuid': 'abc' }, false)).resolves.toBe(true);
    });

    it('returns a typed flags facade backed by the shared client', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        await initialize();
        const [unleash] = unleashInstances;
        if (!unleash) {
            throw new Error('Expected Unleash provider to initialize');
        }
        unleash.isEnabled.mockReturnValue(true);
        await expect(getFlags().isOAuthStateCookieEnforced('uuid1')).resolves.toBe(true);
        expect(unleash.isEnabled).toHaveBeenCalledWith(
            'oauth-state-cookie-enforcement',
            {
                userId: 'uuid1',
                properties: { accountUuid: 'uuid1' }
            },
            false
        );
    });

    it('shouldKeepActionTrace evaluates per environment', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        await initialize();
        const [unleash] = unleashInstances;
        if (!unleash) {
            throw new Error('Expected Unleash provider to initialize');
        }
        unleash.isEnabled.mockReturnValue(true);
        await expect(getFlags().shouldKeepActionTrace(16693)).resolves.toBe(true);
        expect(unleash.isEnabled).toHaveBeenCalledWith(
            'action-trace-manual-keep',
            {
                userId: '16693',
                properties: { environmentId: '16693' }
            },
            false
        );
    });

    it('shouldSendSyncCompletedWebhook evaluates per environment and provider', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        await initialize();
        const [unleash] = unleashInstances;
        if (!unleash) {
            throw new Error('Expected Unleash provider to initialize');
        }
        unleash.isEnabled.mockReturnValue(false);
        await expect(getFlags().shouldSendSyncCompletedWebhook(16693, 'hubspot')).resolves.toBe(false);
        expect(unleash.isEnabled).toHaveBeenCalledWith(
            'sync-completion-webhook-for-webhook-operation',
            {
                userId: '16693:hubspot',
                properties: { environmentId: '16693', providerConfigKey: 'hubspot' }
            },
            true
        );
    });

    it('shouldForwardAllProxyResponseHeaders evaluates per account', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        await initialize();
        const [unleash] = unleashInstances;
        if (!unleash) {
            throw new Error('Expected Unleash provider to initialize');
        }
        unleash.isEnabled.mockReturnValue(true);
        await expect(getFlags().shouldForwardAllProxyResponseHeaders('uuid1')).resolves.toBe(true);
        expect(unleash.isEnabled).toHaveBeenCalledWith(
            'proxy-forward-all-response-headers',
            {
                userId: 'uuid1',
                properties: { accountUuid: 'uuid1' }
            },
            false
        );
    });

    it('reads non-boolean variant payloads (getString), falling back to default otherwise', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        await expect(client.getString('variant-flag', { 'account.id': '1239' }, 'control')).resolves.toBe('new-ui');
        // noop provider returns the default for non-boolean reads
        const { destroy, getFeatureFlagsClient: getNoop } = await import('./index.js');
        await destroy();
        mockEnvs.NANGO_FLAG_PROVIDER = 'noop';
        vi.resetModules();
        const noopClient = await (await import('./index.js')).getFeatureFlagsClient();
        await expect(noopClient.getString('variant-flag', {}, 'control')).resolves.toBe('control');
        void getNoop;
    });

    it('waits for ready before completing init when unleash is slow to synchronize', async () => {
        vi.useFakeTimers();
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.readyDelayMs = 50;
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        let resolved = false;
        const initPromise = getFeatureFlagsClient().then((client) => {
            resolved = true;
            return client;
        });
        await vi.advanceTimersByTimeAsync(10);
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(50);
        await initPromise;
        expect(resolved).toBe(true);
    });

    it('completes init after timeout when unleash never synchronizes', async () => {
        vi.useFakeTimers();
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.readyEvent = 'never';
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        const initPromise = getFeatureFlagsClient();
        await vi.advanceTimersByTimeAsync(100);
        const client = await initPromise;
        await expect(client.isEnabled('any-flag', {}, false)).resolves.toBe(false);
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

    it('retries client creation after a failed initialization', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.failNextInit = 1;
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        await expect(getFeatureFlagsClient()).rejects.toThrow('init failed');
        const client = await getFeatureFlagsClient();
        await expect(client.isEnabled('any-flag', {}, false)).resolves.toBe(false);
    });

    it('returns flag defaults when initialize cannot create the client', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        unleashMockState.failNextInit = 1;
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        await initialize();
        await expect(getFlags().isOAuthStateCookieEnforced('uuid1')).resolves.toBe(false);
    });

    it('returns flag defaults when getFlags is called before initialize', async () => {
        vi.resetModules();
        const { getFlags } = await import('./index.js');
        await expect(getFlags().isOAuthStateCookieEnforced('uuid1')).resolves.toBe(false);
        await expect(getFlags().shouldKeepActionTrace(16693)).resolves.toBe(false);
    });

    it('reconnects to unleash in the background after a failed initialization', async () => {
        vi.useFakeTimers();
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        mockEnvs.NANGO_UNLEASH_REFRESH_INTERVAL_MS = 1000;
        unleashMockState.failNextInit = 1;
        vi.resetModules();
        const { getFeatureFlagsClient } = await import('./index.js');
        await expect(getFeatureFlagsClient()).rejects.toThrow('init failed');
        expect(unleashInstances.length).toBe(0);

        await vi.advanceTimersByTimeAsync(1000);
        await Promise.resolve();

        expect(unleashInstances.length).toBe(1);
        vi.useRealTimers();
    });

    it('updates initialized flags and emits a metric after reconnect succeeds', async () => {
        vi.useFakeTimers();
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        mockEnvs.NANGO_UNLEASH_REFRESH_INTERVAL_MS = 1000;
        unleashMockState.failNextInit = 1;
        vi.resetModules();
        const { initialize, getFlags } = await import('./index.js');
        const { metrics } = await import('@nangohq/utils');
        const incrementSpy = vi.spyOn(metrics, 'increment');
        await initialize();
        await expect(getFlags().isOAuthStateCookieEnforced('uuid1')).resolves.toBe(false);

        await vi.advanceTimersByTimeAsync(1000);
        await Promise.resolve();

        const [unleash] = unleashInstances;
        if (!unleash) {
            throw new Error('Expected Unleash provider to reconnect');
        }
        unleash.isEnabled.mockReturnValue(true);
        await expect(getFlags().isOAuthStateCookieEnforced('uuid1')).resolves.toBe(true);
        expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.FEATURE_FLAGS_CLIENT_RECONNECTED, 1);
        vi.useRealTimers();
    });

    it('cancels a pending reconnect when destroy() is called after a failed initialization', async () => {
        vi.useFakeTimers();
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        mockEnvs.NANGO_UNLEASH_REFRESH_INTERVAL_MS = 1000;
        unleashMockState.failNextInit = 1;
        vi.resetModules();
        const { getFeatureFlagsClient, destroy } = await import('./index.js');
        await expect(getFeatureFlagsClient()).rejects.toThrow('init failed');

        await destroy();
        await vi.advanceTimersByTimeAsync(1000);
        await Promise.resolve();

        expect(unleashInstances.length).toBe(0);
        vi.useRealTimers();
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
        unleashInstances[1]!.isEnabled.mockReturnValue(true);
        await expect(second.isEnabled('any-flag', {}, false)).resolves.toBe(true);
    });

    it('swallows errors from client.destroy()', async () => {
        mockEnvs.NANGO_FLAG_PROVIDER = 'unleash';
        mockEnvs.NANGO_UNLEASH_URL = 'http://unleash.local:4242/api';
        vi.resetModules();
        const { getFeatureFlagsClient, destroy } = await import('./index.js');
        const client = await getFeatureFlagsClient();
        vi.spyOn(client, 'destroy').mockRejectedValue(new Error('destroy failed'));
        await expect(destroy()).resolves.toBeUndefined();
    });
});
