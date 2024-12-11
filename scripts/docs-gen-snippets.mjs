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

        await fs.mkdir(`${snippetsPath}/${path.basename(file, '.mdx')}`, { recursive: true });
        await fs.writeFile(`${snippetsPath}/${path.basename(file, '.mdx')}/PreBuiltTooling.mdx`, toolingSnippet, 'utf-8');

        const casesSnippet = useCasesSnippet({ useCases: useCases[provider] });
        await fs.writeFile(`${snippetsPath}/${path.basename(file, '.mdx')}/PreBuiltUseCases.mdx`, casesSnippet, 'utf-8');
    }
}

function preBuiltToolingSnippet({ prettyAuthMode, hasUseCases }) {
    return `## Pre-built tooling

            <AccordionGroup>  
                <Accordion title="✅ Authorization">
                    | Tools | Status | 
                    | - | - | 
                    | Pre-built authorization (${prettyAuthMode}) | ✅ |
                    | Credentials auto-refresh | ✅ |
                    | Auth parameters validation | Not needed |
                    | Credentials validation | Not needed for OAuth |
                    | Pre-built Connect UI | ✅ |
                    | Custom authorization UI | ✅ |
                    | End-user authorization guide | Not needed for OAuth |
                    | Expired credentials detection | ✅ |
                </Accordion>
                <Accordion title="✅ Read & write data">
                    | Tools | Status | 
                    | - | - | 
                    | Pre-built use-cases | ${hasUseCases ? '✅' : '🚫 (time to contribute: &lt;48h)])'} |
                    | API unification | ✅ |
                    | 2-way sync | ✅ |
                    | Webhooks from Nango on data modifications | ✅ |
                    | Real-time webhooks from 3rd-party API | ✅ |
                    | Proxy requests | ✅ |
                </Accordion>
                <Accordion title="✅ Observability & data quality">
                    | Tools | Status | 
                    | - | - | 
                    | HTTP request logging | ✅ |
                    | End-to-type type safety | ✅ |
                    | Data runtime validation | ✅ |
                    | OpenTelemetry export | ✅ |
                    | Slack alerts on errors | ✅ |
                    | Integration status API | ✅ |
                </Accordion>
                <Accordion title="✅ Customization">
                    | Tools | Status | 
                    | - | - | 
                    | Create or customize use-cases | ✅ |
                    | Pre-configured pagination | ✅ |
                    | Pre-configured rate-limit handling | ✅ |
                    | Per-customer configurations | ✅ |
                </Accordion>
            </AccordionGroup>  
        `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
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
                                    `| \`${endpoint.method} ${endpoint.path}\` | ${endpoint.description?.replaceAll('\n', '<br />')} | [github.com](https://github.com/NangoHQ/integration-templates/blob/main/integrations/${endpoint.script}.md) |`
                            )
                            .join('\n')}
                        </Accordion>
                `
                )
                .join('\n')}
        </AccordionGroup>
    `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
}

function emptyUseCases() {
    return `## Pre-built use-cases

        _No pre-built use-cases yet (time to contribute: &lt;48h)_
        
        <Tip>Not seeing the use-case you need? [Build your own](https://nango.dev/slack) independently.</Tip>
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
