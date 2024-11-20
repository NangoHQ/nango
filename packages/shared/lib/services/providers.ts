import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import { dirname } from '../utils/utils.js';
import { getLogger, ENVS, parseEnvs } from '@nangohq/utils';
import { createHash } from 'node:crypto';

const logger = getLogger('providers');

let providers: Record<string, Provider> | undefined = undefined;

export function getProviders() {
    if (!providers) {
        providers = loadProvidersYaml();
    }

    return providers;
}

export function getProvider(providerName: string): Provider | null {
    const providers = getProviders();
    return providers?.[providerName] ?? null;
}

// Monitors for changes to providers over HTTP. Returns a function to clean up
// the monitoring.
export async function monitorProviders(): Promise<() => void> {
    const envs = parseEnvs(ENVS);

    const providersUrl = envs.PROVIDERS_URL;
    const reloadInterval = envs.PROVIDERS_RELOAD_INTERVAL;

    // fall back to standard disk loading if no URL is provided
    if (!providersUrl) {
        return () => null;
    }

    const providersRaw = await fetchProvidersRaw(providersUrl);
    let providersHash = createHash('sha1').update(providersRaw).digest('hex');
    providers = JSON.parse(providersRaw) as Record<string, Provider>;
    logger.info(`Providers loaded from url ${providersUrl} (${providersHash})`);

    const timeout = setInterval(async () => {
        try {
            const providersRaw = await fetchProvidersRaw(providersUrl);
            const newProvidersHash = createHash('sha1').update(providersRaw).digest('hex');

            if (newProvidersHash !== providersHash) {
                providersHash = newProvidersHash;
                providers = JSON.parse(providersRaw) as Record<string, Provider>;
                logger.info(`Providers reloaded (${providersHash})`);
            }
        } catch (err) {
            logger.error('Failed to fetch providers.json', err);
        }
    }, reloadInterval);

    return () => clearInterval(timeout);
}

async function fetchProvidersRaw(providersUrl: string): Promise<string> {
    const response = await fetch(providersUrl);

    if (!response.ok) {
        throw new NangoError('providers_json_fetch_failed');
    }

    return await response.text();
}

function getProvidersPath() {
    // find the providers.yaml file
    // recursively searching in parent directories
    const findProvidersYaml = (dir: string): string => {
        const providersYamlPath = path.join(dir, 'providers.yaml');
        if (fs.existsSync(providersYamlPath)) {
            return providersYamlPath;
        }
        const parentDir = path.dirname(dir);
        if (parentDir === dir) {
            throw new NangoError('providers_yaml_not_found');
        }
        return findProvidersYaml(parentDir);
    };
    return findProvidersYaml(dirname());
}

function loadProvidersYaml(): Record<string, Provider> | undefined {
    try {
        const fileEntries = yaml.load(fs.readFileSync(getProvidersPath()).toString()) as Record<string, Provider | ProviderAlias>;

        if (fileEntries == null) {
            throw new NangoError('provider_template_loading_failed');
        }

        for (const key in fileEntries) {
            const entry = fileEntries[key];

            if (entry && 'alias' in entry) {
                if (Object.keys(entry).length <= 0) {
                    logger.error('Failed to find alias', entry.alias);
                    continue;
                }

                const { alias, ...overrides } = entry;
                const aliasData = fileEntries[entry.alias] as Provider;
                fileEntries[key] = { ...aliasData, ...overrides };
            }
        }

        return fileEntries as Record<string, Provider>;
    } catch (err) {
        logger.error('Failed to load providers.yaml', err);
    }
    return;
}
