import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const prettyAuthModes = {
    OAUTH1: 'OAuth',
    OAUTH2: 'OAuth',
    OAUTH2_CC: 'OAuth',
    BASIC: 'Basic',
    API_KEY: 'API Key',
    APP_STORE: 'Custom',
    BILL: 'Bill',
    SIGNATURE: 'Signature',
    JWT: 'JWT',
    TWO_STEP: 'Two Step',
    TABLEAU: 'Tableau'
};

const providersPath = 'packages/shared/providers.yaml';
const flowsPath = 'packages/shared/flows.yaml';
const docsPath = 'docs-v2/integrations/all';
const snippetsPath = 'docs-v2/snippets/generated';

const providers = yaml.load(await fs.readFile(providersPath, 'utf-8'));
const flows = yaml.load(await fs.readFile(flowsPath, 'utf-8'));

const useCases = {};
for (const [integration, config] of Object.entries(flows.integrations)) {
    useCases[integration] = buildEndpoints(config.actions, integration).concat(buildEndpoints(config.syncs, integration));
}

const files = await fs.readdir(docsPath);
for (const file of files) {
    if (file.endsWith('.mdx')) {
        const filePath = path.join(docsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        let lines = content.split('\n');

        // find the integration line
        const providerLine = lines.find((line) => line.startsWith('provider: '));
        if (!providerLine) {
            throw new Error(`No provider line found in ${file}`);
        }

        const provider = providerLine.split('provider: ')[1].trim();

        // write pre-built tooling snippet for the integration
        const providerConfig = providers[provider];
        if (!providerConfig) {
            throw new Error(`Unknown provider ${provider} in ${file}`);
        }
        const authMode = providers[provider].auth_mode;
        const prettyAuthMode = prettyAuthModes[authMode] || authMode;
        const hasUseCases = useCases[provider] && useCases[provider].length > 0;
        const toolingSnippet = preBuiltToolingSnippet({ prettyAuthMode, hasUseCases });
        const snippetPath = `${snippetsPath}/${path.basename(file, '.mdx')}`;

        await fs.mkdir(snippetPath, { recursive: true });

        const casesSnippet = useCasesSnippet({ useCases: useCases[provider] });
        await fs.writeFile(`${snippetPath}/PreBuiltUseCases.mdx`, casesSnippet, 'utf-8');
    }
}

function useCasesSnippet({ useCases }) {
    if (!useCases || useCases.length === 0) {
        return emptyUseCases();
    }

    const groups = {};
    for (const useCase of useCases) {
        const groupName = useCase.group || 'Others';
        useCase.group = groupName;

        groups[groupName] = groups[groupName] || [];
        groups[groupName].push(useCase);
    }

    const sortedGroups = Object.keys(groups)
        .sort()
        .reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {});

    // make sure Others is last
    if (sortedGroups['Others']) {
        const others = sortedGroups['Others'];
        delete sortedGroups.Others;
        sortedGroups.Others = others;
    }

    return `
        ## Pre-built use cases
        
        <AccordionGroup>
            
            ${Object.values(sortedGroups)
                .map(
                    (group) => `
                        <Accordion title="${group[0].group || 'Others'}">
                        | Endpoint | Description | Readme |
                        | - | - | - |
                        ${group
                            .map(
                                (endpoint) =>
                                    `| \`${endpoint.method} ${endpoint.path}\` | ${endpoint.description?.replaceAll('\n', '<br />')} | [🔗](https://github.com/NangoHQ/integration-templates/blob/main/integrations/${endpoint.script}.md) |`
                            )
                            .join('\n')}
                        </Accordion>
                `
                )
                .join('\n')}
        </AccordionGroup>

        <Tip>Not seeing the use case you need? [Build your own](https://nango.dev/slack) independently.</Tip>
    `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
}

function emptyUseCases() {
    return `## Pre-built use-cases

        _No pre-built use cases yet (time to contribute: &lt;48h)_
        
        <Tip>Not seeing the use case you need? [Build your own](https://nango.dev/slack) independently.</Tip>
    `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
}

function buildEndpoints(syncOrAction, integration) {
    const endpoints = [];
    if (syncOrAction) {
        for (const [key, item] of Object.entries(syncOrAction)) {
            const syncEndpoints = Array.isArray(item.endpoint) ? item.endpoint : [item.endpoint];
            for (const endpoint of syncEndpoints) {
                endpoints.push({
                    method: endpoint.method,
                    path: endpoint.path,
                    description: item.description?.trim(),
                    group: endpoint.group,
                    script: `${integration}/actions/${key}`
                });
            }
        }
    }

    return endpoints;
}
