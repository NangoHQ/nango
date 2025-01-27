import type { Provider } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import { getLogger, ENVS, parseEnvs } from '@nangohq/utils';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { updateProviderCache } from '@nangohq/providers';

// Just to avoid changing hundreds of refs
export { getProviders, getProvider } from '@nangohq/providers';

const logger = getLogger('providers');
const envs = parseEnvs(ENVS);

let polling = false;
let providersHash = '';

// Monitors for changes to providers over HTTP. Returns a function to clean up
// the monitoring.
export async function monitorProviders(): Promise<() => void> {
    const providersUrl = envs.PROVIDERS_URL;

    // fall back to standard disk loading if no URL is provided
    if (!providersUrl) {
        return () => null;
    }

    const providersRaw = await fetchProvidersRaw(providersUrl);
    providersHash = createHash('sha1').update(providersRaw).digest('hex');

    updateProviderCache(JSON.parse(providersRaw) as Record<string, Provider>);
    logger.info(`Providers loaded from url ${providersUrl} (${providersHash})`);

    void pollProviders(providersUrl);

    return () => {
        polling = false;
    };
}

async function pollProviders(providersUrl: string) {
    if (polling) {
        return;
    }

    polling = true;

    const reloadInterval = envs.PROVIDERS_RELOAD_INTERVAL;

    while (polling) {
        await setTimeout(reloadInterval);

        try {
            const providersRaw = await fetchProvidersRaw(providersUrl);
            const newProvidersHash = createHash('sha1').update(providersRaw).digest('hex');

            if (newProvidersHash !== providersHash) {
                providersHash = newProvidersHash;
                updateProviderCache(JSON.parse(providersRaw) as Record<string, Provider>);
                logger.info(`Providers reloaded (${providersHash})`);
            }
        } catch (err) {
            logger.error('Failed to fetch providers.json', err);
        }
    }
}

async function fetchProvidersRaw(providersUrl: string): Promise<string> {
    const response = await fetch(providersUrl);

    if (!response.ok) {
        throw new NangoError('providers_json_fetch_failed');
    }

    return await response.text();
}
