import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import { dirname } from '../utils/utils.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('providers');
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
    providers = await loadProvidersYaml();

    setTimeout(async () => {
        try {
            providers = await loadProvidersYaml();
        } catch (err) {
            logger.error('Failed to load providers.yaml', err);
        }
    }, 30000);
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

async function loadProvidersYaml(): Promise<Record<string, Provider> | undefined> {
    const providersPath = await getProvidersPath();
    const rawFile = (await fs.readFile(providersPath)).toString();

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
