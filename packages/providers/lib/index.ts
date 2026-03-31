import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { clearLocalizationCache, getLocalizedProviders } from './localization.js';

import type { Provider, ProviderAlias } from '@nangohq/types';

const __filename = fileURLToPath(import.meta.url);
const pkgRoot = path.join(__filename, '../../');

let providers: Record<string, Provider> | undefined = undefined;
let providerScopes: Record<string, string[]> | undefined = undefined;

export function updateProviderCache(update: Record<string, Provider>): void {
    providers = update;
    // Clear language cache when base providers are updated
    clearLocalizationCache();
}

export function getProviders(language?: string): Record<string, Provider> | undefined {
    if (!providers) {
        providers = loadProvidersYaml();
    }

    if (!providers || !language) {
        return providers;
    }

    return getLocalizedProviders(providers, language);
}

export function getProvider(providerName: string, language?: string): Provider | null {
    const providers = getProviders(language);
    return providers?.[providerName] ?? null;
}

export function loadProvidersYaml(): Record<string, Provider> | undefined {
    try {
        const providersYamlPath = path.join(pkgRoot, 'providers.yaml');
        const fileEntries = yaml.load(fs.readFileSync(providersYamlPath).toString()) as Record<string, Provider | ProviderAlias>;

        if (fileEntries == null) {
            throw new Error('provider_template_loading_failed');
        }

        for (const key in fileEntries) {
            const entry = fileEntries[key];

            if (entry && 'alias' in entry) {
                if (Object.keys(entry).length <= 0) {
                    continue;
                }

                const { alias, ...overrides } = entry;
                const aliasData = fileEntries[entry.alias] as Provider;
                fileEntries[key] = { ...aliasData, ...overrides };
            }
        }

        return fileEntries as Record<string, Provider>;
    } catch {
        return undefined;
    }
}

export function getProviderScopes(): Record<string, string[]> | undefined {
    return loadProviderScopesYaml();
}

function loadProviderScopesYaml(): Record<string, string[]> | undefined {
    if (providerScopes) {
        return providerScopes;
    }

    try {
        const providersScopesYamlPath = path.join(pkgRoot, 'providers.scopes.yaml');
        if (!fs.existsSync(providersScopesYamlPath)) {
            return undefined;
        }

        const scopesFileEntries = yaml.load(fs.readFileSync(providersScopesYamlPath).toString()) as Record<string, string[]> | null;
        providerScopes = scopesFileEntries || {};
        return providerScopes;
    } catch {
        return undefined;
    }
}
