import fs from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';

import type { Provider } from '@nangohq/types';

const prettyAuthModes: Record<string, string> = {
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
    TABLEAU: 'Tableau',
    MCP_OAUTH2: 'MCP OAuth2'
};

const flowsPath = 'packages/shared/flows.zero.json';
const providersPath = 'packages/providers/providers.yaml';
const docsPaths = ['docs/integrations/all', 'docs/api-integrations'];
const snippetsPath = 'docs/snippets/generated';

// TODO: remove once alias providers declare webhook support in providers.yaml explicitly.
const snippetSkipList = new Set(['confluence']);

const flowsString = await fs.readFile(flowsPath, 'utf-8');
const flows = JSON.parse(flowsString);
const providers = yaml.load(await fs.readFile(providersPath, 'utf-8')) as Record<string, Provider>;

const useCases: Record<string, any> = {};
for (const flow of flows) {
    const integration = flow.providerConfigKey;
    const actions = flow.actions;
    const syncs = flow.syncs;
    const symLinkTargetName = flow.symLinkTargetName;
    useCases[integration] = buildEndpoints('action', actions, integration, symLinkTargetName).concat(
        buildEndpoints('sync', syncs, integration, symLinkTargetName)
    );
}

const providersHandled: string[] = [];
for (const docsPath of docsPaths) {
    const files = await fs.readdir(docsPath);
    for (const file of files) {
        if (file.endsWith('.mdx')) {
            const provider = path.basename(file, '.mdx');

            // Skip if already processed from another directory
            if (providersHandled.includes(provider)) {
                console.log(`Skipping ${provider} (already processed from another directory)`);
                continue;
            }

            if (snippetSkipList.has(provider)) {
                providersHandled.push(provider);
                continue;
            }

            const snippetPath = `${snippetsPath}/${path.basename(file, '.mdx')}`;

            await fs.mkdir(snippetPath, { recursive: true });

            const maybeAliased: Provider | undefined = providers[provider];
            if (!maybeAliased) {
                throw new Error(`Couldn't find provider config for  ${provider}`);
            }

            const providerConfig: Provider | undefined = (maybeAliased as any)['alias'] ? providers[(maybeAliased as any)['alias']] : maybeAliased;
            if (!providerConfig) {
                throw new Error(`Couldn't find provider alias for ${(maybeAliased as any)['alias']}`);
            }

            const docLink = maybeAliased.docs.split('/').slice(-1)[0];
            if (docLink !== provider) {
                console.log(`Docs link doesn't match provider name: ${docLink} !== ${provider}`);
            }

            const isAlias = !!(maybeAliased as any)['alias'];
            const toolingSnippet = preBuiltToolingSnippet(providerConfig, useCases[provider], isAlias);
            await fs.writeFile(`${snippetPath}/PreBuiltTooling.mdx`, toolingSnippet, 'utf-8');

            const casesSnippet = useCasesSnippet(useCases[provider]);
            await fs.writeFile(`${snippetPath}/PreBuiltUseCases.mdx`, casesSnippet, 'utf-8');

            providersHandled.push(provider);
        }
    }
}

const allProviders = Object.keys(providers);
const missingDocs = allProviders.filter((provider) => !providersHandled.includes(provider));

if (missingDocs.length > 0) {
    console.log(`Missing provider docs: ${missingDocs.join(', ')}`);
}

function preBuiltToolingSnippet(providerConfig: Provider, useCases: any, isAlias = false) {
    const prettyAuthMode = prettyAuthModes[providerConfig.auth_mode];
    const hasAuthParams = !!providerConfig.authorization_params;
    const hasAuthGuide = !!providerConfig.docs_connect;
    const hasUseCases = useCases && useCases.length > 0;
    // TODO: remove once alias providers declare webhook support in providers.yaml explicitly.
    const hasWebHooks = !isAlias && !!providerConfig.webhook_routing_script;
    const hasPagination = !!providerConfig.proxy?.paginate;
    const hasRateLimit = !!providerConfig.proxy?.retry?.at;

    return [
        `## Pre-built tooling`,
        `<AccordionGroup>`,
        `<Accordion title="✅ Authorization">`,
        `| Tools | Status |`,
        `| - | - |`,
        `| Pre-built authorization (${prettyAuthMode}) | ✅ |`,
        prettyAuthMode === 'OAuth' ? `| Credentials auto-refresh | ✅ |` : ``,
        hasAuthParams ? `| Auth parameters validation | ✅ |` : ``,
        `| Pre-built authorization UI | ✅ |`,
        `| Custom authorization UI | ✅ |`,
        prettyAuthMode !== 'OAuth' || hasAuthGuide ? `| End-user authorization guide | ${hasAuthGuide ? '✅' : '🚫'} |` : ``,
        `| Expired credentials detection | ✅ |`,
        `</Accordion>`,
        `<Accordion title="✅ Read & write data">`,
        `| Tools | Status |`,
        `| - | - |`,
        `| Pre-built integrations | ${hasUseCases ? '✅' : '🚫 (time to contribute: &lt;48h)'} |`,
        `| API unification | ✅ |`,
        `| 2-way sync | ✅ |`,
        `| Webhooks from Nango on data modifications | ✅ |`,
        `| Real-time webhooks from 3rd-party API | ${hasWebHooks ? '✅' : '🚫 (time to contribute: &lt;48h)'} |`,
        `| Proxy requests | ✅ |`,
        `</Accordion>`,
        `<Accordion title="✅ Observability & data quality">`,
        `| Tools | Status |`,
        `| - | - |`,
        `| HTTP request logging | ✅ |`,
        `| End-to-end type safety | ✅ |`,
        `| Data runtime validation | ✅ |`,
        `| OpenTelemetry export | ✅ |`,
        `| Slack alerts on errors | ✅ |`,
        `| Integration status API | ✅ |`,
        `</Accordion>`,
        `<Accordion title="✅ Customization">`,
        `| Tools | Status |`,
        `| - | - |`,
        `| Create or customize use-cases | ✅ |`,
        `| Pre-configured pagination | ${hasPagination ? '✅' : '🚫 (time to contribute: &lt;48h)'} |`,
        `| Pre-configured rate-limit handling | ${hasRateLimit ? '✅' : '🚫 (time to contribute: &lt;48h)'} |`,
        `| Per-customer configurations | ✅ |`,
        `</Accordion>`,
        `</AccordionGroup>`
    ]
        .filter((line) => line !== '')
        .join('\n');
}

function useCasesSnippet(useCases: any) {
    if (!useCases || useCases.length === 0) {
        return emptyUseCases();
    }

    const groups: Record<string, Endpoint[]> = {};
    for (const useCase of useCases) {
        const groupName = useCase.group || 'Others';

        groups[groupName] = groups[groupName] || [];
        groups[groupName].push(useCase);
    }

    const sortedGroups = Object.keys(groups)
        .sort()
        .reduce<Record<string, Endpoint[]>>((acc, key) => {
            if (groups[key]) {
                acc[key] = groups[key];
            }

            return acc;
        }, {});

    // make sure Others is last
    if (sortedGroups['Others']) {
        const others = sortedGroups['Others'];
        delete sortedGroups['Others'];
        sortedGroups['Others'] = others;
    }

    const sections = Object.entries(sortedGroups)
        .map(([groupName, endpoints]) => {
            return `
### ${groupName}

| Function name | Description | Type | Source code |
| - | - | - | - |
${endpoints
    .map(
        (endpoint) =>
            `| \`${endpoint.functionName}\` | ${endpoint.description?.replaceAll('\n', ' ') ?? ''} | [${endpoint.type === 'sync' ? 'Sync' : 'Action'}](${endpoint.type === 'sync' ? '/guides/functions/syncs/sync-functions' : '/guides/functions/action-functions'}) | [🔗 Github](https://github.com/NangoHQ/integration-templates/blob/main/integrations/${endpoint.script}.ts) |`
    )
    .join('\n')}
            `.trim();
        })
        .join('\n\n');

    return sections;
}

function emptyUseCases() {
    return `_No pre-built syncs or actions available yet._

<Tip>Not seeing the integration you need? [Build your own](/guides/functions/functions-guide) independently.</Tip>`;
}

interface Endpoint {
    functionName: string;
    method: string;
    path: string;
    description: string;
    group: string;
    script: string;
    type: string;
}

function buildEndpoints(type: string, syncOrAction: any, integration: string, symLinkTargetName: string | null) {
    const endpoints: Endpoint[] = [];
    if (syncOrAction) {
        for (const item of syncOrAction) {
            if (!item?.endpoints && !item?.endpoint) {
                continue;
            }

            const endpointOrEndpoints = item?.endpoint || item?.endpoints;
            const currentEndpoints = Array.isArray(endpointOrEndpoints) ? endpointOrEndpoints : [endpointOrEndpoints];
            for (const endpoint of currentEndpoints) {
                endpoints.push({
                    functionName: item.name,
                    method: endpoint?.method,
                    path: endpoint?.path,
                    description: item?.description?.trim(),
                    group: endpoint?.group,
                    script: `${symLinkTargetName || integration}/${type}s/${item.name}`,
                    type: type
                });
            }
        }
    }

    return endpoints;
}
