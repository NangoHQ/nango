import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import { dirname } from '../utils/utils.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('providers');
let providers: Record<string, Provider> | undefined = undefined;

export function getProviders() {
    if (!providers) {
        providers = loadProvidersYaml();
    }

    return providers;
}

export function checkProviderExists(provider: string) {
    getProviders();
    return providers && provider in providers;
}

export function getProvider(provider: string): Provider | null {
    getProviders();
    return providers && provider in providers ? providers[provider]! : null;
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
