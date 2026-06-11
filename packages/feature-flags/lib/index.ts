import { getLogger } from '@nangohq/utils';

import { buildFeatureFlagsClient } from './client.js';
import { envs } from './env.js';
import { NoopProvider } from './providers/noop.js';
import { UnleashProvider } from './providers/unleash.js';

import type { FeatureFlagsClient } from './client.js';
import type { Provider } from '@openfeature/server-sdk';

export type { FeatureFlagsClient } from './client.js';
export type { FlagContext } from './types.js';
export { FLAGS, type FlagKey } from './registry.js';

let clientPromise: Promise<FeatureFlagsClient> | undefined;
let destroyPromise: Promise<void> | undefined;

const logger = getLogger('FeatureFlags');

export async function getFeatureFlagsClient(): Promise<FeatureFlagsClient> {
    if (destroyPromise) await destroyPromise;
    if (clientPromise) return clientPromise;
    clientPromise = createClient();
    clientPromise.catch((err: unknown) => logger.error('Error creating feature flags client', err));
    return clientPromise;
}

export async function destroy(): Promise<void> {
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
        }
    })();
    return destroyPromise;
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
