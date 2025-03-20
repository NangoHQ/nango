import fs from 'node:fs';
import { getProviders } from '../../../packages/providers/lib/index.js';
import type { Provider } from '../../../packages/types/lib/index.js';
import yaml from 'js-yaml';
import { exit } from 'node:process';

const PROVIDERS_FILE_PATH = 'packages/providers/providers.yaml';

export const getProvidersWithConnectUI = (): string[] => {
    // get all folders in ../../../docs-v2/integrations/all that have a `connect.mdx` file in them
    const folders = fs.readdirSync('docs-v2/integrations/all');
    const providersWithConnectUI = folders.filter((folder) => fs.existsSync(`docs-v2/integrations/all/${folder}/connect.mdx`));

    return providersWithConnectUI;
};

export const getProvidersWithoutDefinedConnectOrConnectUI = (providersWithConnectUI: string[], providers: Record<string, Provider>) => {
    // get all providers that don't have a docs_connect property or a docs property
    const providersWithoutConnectUI = [];
    const providersWithoutDocs = [];
    if (!providers) {
        return null;
    }
    for (const provider of providersWithConnectUI) {
        if (!providers[provider]?.docs_connect) {
            providersWithoutConnectUI.push(provider);
        }
        if (!providers[provider]?.docs) {
            providersWithoutDocs.push(provider);
        }
    }
    return { providersWithoutConnectUI, providersWithoutDocs };
};

export const addPropertyToProviders = <K extends keyof Provider>(
    providersToUpdate: string[],
    providers: Record<string, Provider>,
    property: K,
    valueFormatter: (provider: string) => Provider[K]
): Record<string, Provider> => {
    providersToUpdate.forEach((provider) => {
        if (providers[provider] && !providers[provider][property]) {
            providers[provider][property] = valueFormatter(provider);
        }
    });
    return providers;
};

export const writeProvidersToFile = (providers: Record<string, Provider>) => {
    fs.writeFileSync(
        PROVIDERS_FILE_PATH,
        yaml.dump(providers, {
            indent: 4,
            noRefs: true,
            quotingType: "'"
        })
    );
};

const providers = getProviders();
if (!providers) exit(0);
const providersWithConnectUI = getProvidersWithConnectUI();
const providersWithoutDefinedConnectUI = getProvidersWithoutDefinedConnectOrConnectUI(providersWithConnectUI, providers);
if (!providersWithoutDefinedConnectUI) exit(0);

addPropertyToProviders(
    providersWithoutDefinedConnectUI.providersWithoutConnectUI,
    providers,
    'docs_connect',
    (provider) => `https://docs.nango.dev/integrations/all/${provider}/connect`
);

addPropertyToProviders(
    providersWithoutDefinedConnectUI.providersWithoutDocs,
    providers,
    'docs',
    (provider) => `https://docs.nango.dev/integrations/all/${provider}`
);

writeProvidersToFile(providers);
