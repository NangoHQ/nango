import fs from 'node:fs';
import { getProviders } from '../../../packages/providers/lib/index.js';
import type { Provider } from '../../../packages/types/lib/index.js';
import yaml from 'js-yaml';
import { exit } from 'node:process';

const PROVIDERS_FILE_PATH = 'packages/providers/providers.yaml';

/// get all folders in /docs-v2/integrations/all that have a `connect.mdx` file in them
export const getProvidersWithConnectUI = (): string[] => {
    const folders = fs.readdirSync('docs-v2/integrations/all');
    const providersWithConnectUI = folders.filter((folder) => fs.existsSync(`docs-v2/integrations/all/${folder}/connect.mdx`));

    return providersWithConnectUI;
};

/// get all providers that don't have a docs_connect property or a docs property
export const getProvidersWithoutDefinedConnectOrConnectUI = (providersWithConnectUI: string[], providers: Record<string, Provider>) => {
    const providersWithoutConnectUI = [];
    const providersWithoutDocs = [];

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

/// Add a property to the providers object
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

/// Write the providers object to the providers.yaml file
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

console.log('Updating providers.yaml with docs_connect and docs properties');
const providers = getProviders();
if (!providers) exit(0);

const providersWithConnectUI = getProvidersWithConnectUI();
const providersWithoutDefinedConnectUI = getProvidersWithoutDefinedConnectOrConnectUI(providersWithConnectUI, providers);

if (providersWithoutDefinedConnectUI.providersWithoutConnectUI.length) {
    console.log('Adding docs_connect property to providers without defined connectUI', providersWithoutDefinedConnectUI.providersWithoutConnectUI);

    addPropertyToProviders(
        providersWithoutDefinedConnectUI.providersWithoutConnectUI,
        providers,
        'docs_connect',
        (provider) => `https://docs.nango.dev/integrations/all/${provider}/connect`
    );
} else {
    console.log('No providers without defined connect or connectUI found');
}

if (providersWithoutDefinedConnectUI.providersWithoutDocs.length) {
    console.log('Adding docs property to providers without defined docs', providersWithoutDefinedConnectUI.providersWithoutDocs);

    addPropertyToProviders(
        providersWithoutDefinedConnectUI.providersWithoutDocs,
        providers,
        'docs',
        (provider) => `https://docs.nango.dev/integrations/all/${provider}`
    );
} else {
    console.log('No providers without defined docs found');
}

if (providersWithoutDefinedConnectUI.providersWithoutConnectUI.length || providersWithoutDefinedConnectUI.providersWithoutDocs.length) {
    console.log('Writing providers to providers.yaml');
    writeProvidersToFile(providers);
    console.log('Boom! providers.yaml updated!');
} else {
    console.log('No providers to update');
}
