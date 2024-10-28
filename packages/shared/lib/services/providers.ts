import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import { dirname } from '../utils/utils.js';
import { getLogger } from '@nangohq/utils';
import { createHash } from 'node:crypto';

const logger = getLogger('providers');
const providersUrl = process.env['PROVIDERS_URL'];
const reloadInterval = parseInt(process.env['PROVIDERS_RELOAD_INTERVAL'] || '30000');
let providersHash: string | undefined = undefined;
let providers: Record<string, Provider> | undefined = undefined;

export function getProviders() {
    if (!providers) {
        throw new NangoError('providers_not_loaded');
    }

    return providers;
}

export function getProvider(providerName: string): Provider | null {
    const providers = getProviders();
    return providers?.[providerName] ?? null;
}

export async function launchProvidersSync() {
    const rawProviders = await loadProvidersRaw();
    providersHash = createHash('sha1').update(rawProviders).digest('hex');
    providers = parseProviders(rawProviders);

    if (providersUrl) {
        setInterval(async () => {
            try {
                const maybeNewProviders = await loadProvidersRaw();
                const newProvidersHash = createHash('sha1').update(maybeNewProviders).digest('hex');

                if (newProvidersHash !== providersHash) {
                    providersHash = newProvidersHash;
                    providers = parseProviders(rawProviders);
                    logger.info(`providers updated to hash ${providersHash}`);
                }
            } catch (err) {
                logger.error('Failed to load providers.yaml', err);
            }
        }, reloadInterval);
    }
}

async function getProvidersPath() {
    // find the providers.yaml file
    // recursively searching in parent directories
    const findProvidersYaml = async (dir: string): Promise<string> => {
        const providersYamlPath = path.join(dir, 'providers.yaml');

        try {
            await fs.stat(providersYamlPath);
            return providersYamlPath;
        } catch {
            const parentDir = path.dirname(dir);
            if (parentDir === dir) {
                throw new NangoError('providers_yaml_not_found');
            }
            return findProvidersYaml(parentDir);
        }
    };
    return findProvidersYaml(dirname());
}

async function loadProvidersRaw(): Promise<string> {
    let rawFile: string | undefined;

    if (!providersUrl) {
        const providersPath = await getProvidersPath();
        rawFile = (await fs.readFile(providersPath)).toString();
    } else {
        const url = new URL(providersUrl);

        // bust caches
        url.searchParams.set('t', Date.now().toString());

        const response = await fetch(url);
        if (response.ok) {
            rawFile = await response.text();
        } else {
            throw new NangoError('provider_template_loading_fetch_failed');
        }
    }

    return rawFile;
}

function parseProviders(rawFile: string): Record<string, Provider> {
    const fileEntries = yaml.load(rawFile) as Record<string, Provider | ProviderAlias>;

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
}
