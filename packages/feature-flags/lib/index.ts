import { getLogger, metrics } from '@nangohq/utils';

import { buildFeatureFlagsClient } from './client.js';
import { envs } from './env.js';
import { buildFlags } from './flags.js';
import { NoopProvider } from './providers/noop.js';
import { UnleashProvider } from './providers/unleash.js';

import type { FeatureFlagsClient } from './client.js';
import type { Flags } from './flags.js';
import type { Provider } from '@openfeature/server-sdk';

export type { FeatureFlagsClient } from './client.js';
export type { FlagContext } from './types.js';
export type { Flags } from './flags.js';

let clientPromise: Promise<FeatureFlagsClient> | undefined;
let destroyPromise: Promise<void> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let flagsInstance: Flags | undefined;

const logger = getLogger('FeatureFlags');
const noopClient = buildFeatureFlagsClient(new NoopProvider());
const noopFlags = buildFlags(noopClient);

/**
 * Initialize the typed flag facade for this process. Call once during service
 * startup. Fail-open: uses flag defaults when the client cannot be created.
 */
export async function initialize(): Promise<void> {
    let client: FeatureFlagsClient;
    try {
        client = await getFeatureFlagsClient();
    } catch {
        metrics.increment(metrics.Types.FEATURE_FLAGS_CLIENT_UNAVAILABLE, 1);
        client = noopClient;
    }
    flagsInstance = buildFlags(client);
}

/**
 * Typed flag facade. Safe before {@link initialize}: returns defaults via the noop provider.
 */
export function getFlags(): Flags {
    return flagsInstance ?? noopFlags;
}

export async function getFeatureFlagsClient(): Promise<FeatureFlagsClient> {
    if (destroyPromise) await destroyPromise;
    if (clientPromise) return clientPromise;
    clientPromise = createClient()
        .then((client) => {
            cancelReconnect();
            return client;
        })
        .catch((err: unknown) => {
            clientPromise = undefined;
            logger.error('Error creating feature flags client', err);
            scheduleReconnect();
            throw err;
        });
    return clientPromise;
}

async function createClient(): Promise<FeatureFlagsClient> {
    const provider = await buildProvider();
    return buildFeatureFlagsClient(provider);
}

async function buildProvider(): Promise<Provider> {
    if (envs.NANGO_FLAG_PROVIDER === 'unleash') {
        if (!envs.NANGO_UNLEASH_URL) {
            logger.warning('NANGO_FLAG_PROVIDER=unleash but NANGO_UNLEASH_URL is unset; using noop provider');
            return new NoopProvider();
        }
        const provider = new UnleashProvider({
            url: envs.NANGO_UNLEASH_URL,
            appName: envs.NANGO_UNLEASH_APP_NAME,
            apiToken: envs.NANGO_UNLEASH_API_TOKEN,
            refreshIntervalMs: envs.NANGO_UNLEASH_REFRESH_INTERVAL_MS,
            initTimeoutMs: envs.NANGO_UNLEASH_INIT_TIMEOUT_MS
        });
        await provider.initialize();
        if (provider.hasSynchronized()) {
            logger.info('Unleash provider initialized');
        } else {
            logger.warning('Unleash provider initialized without toggle data; evaluations will use defaults until synchronized');
        }
        return provider;
    }
    logger.info('Using noop feature-flags provider');
    return new NoopProvider();
}

function cancelReconnect(): void {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    }
}

function scheduleReconnect(): void {
    if (reconnectTimer) return;
    if (envs.NANGO_FLAG_PROVIDER !== 'unleash' || !envs.NANGO_UNLEASH_URL) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        if (clientPromise || destroyPromise) return;
        void getFeatureFlagsClient()
            .then((client) => {
                setActiveClient(client);
                logger.info('Feature flags client reconnected to Unleash');
                metrics.increment(metrics.Types.FEATURE_FLAGS_CLIENT_RECONNECTED, 1);
            })
            .catch(() => {
                scheduleReconnect();
            });
    }, envs.NANGO_UNLEASH_REFRESH_INTERVAL_MS);
    if (typeof reconnectTimer.unref === 'function') {
        reconnectTimer.unref();
    }
}

function setActiveClient(client: FeatureFlagsClient): void {
    if (!flagsInstance) {
        return;
    }
    flagsInstance = buildFlags(client);
}

export async function destroy(): Promise<void> {
    cancelReconnect();
    flagsInstance = undefined;
    if (destroyPromise) return destroyPromise;
    const promise = clientPromise;
    if (!promise) return;
    destroyPromise = (async () => {
        try {
            logger.info('Destroying feature flags client');
            const client = await promise;
            await client.destroy();
        } finally {
            clientPromise = undefined;
            destroyPromise = undefined;
            cancelReconnect();
        }
    })();
    return destroyPromise;
}
