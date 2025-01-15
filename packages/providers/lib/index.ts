import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import type { Provider, ProviderAlias } from '@nangohq/types';

const __filename = fileURLToPath(import.meta.url);
const pkgRoot = path.join(__filename, '../../');

let providers: Record<string, Provider> | undefined = undefined;

export function updateProviderCache(update: Record<string, Provider>) {
    providers = update;
}

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

function loadProvidersYaml(): Record<string, Provider> | undefined {
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
                    console.error('Failed to find alias', entry.alias);
                    continue;
                }

                const { alias, ...overrides } = entry;
                const aliasData = fileEntries[entry.alias] as Provider;
                fileEntries[key] = { ...aliasData, ...overrides };
            }
        }

        return fileEntries as Record<string, Provider>;
    } catch (err) {
        console.error('Failed to load providers.yaml', err);
    }
    return;
}
