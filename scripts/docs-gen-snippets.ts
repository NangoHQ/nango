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
    TABLEAU: 'Tableau'
};

const flowsPath = 'packages/shared/flows.yaml';
const providersPath = 'packages/providers/providers.yaml';
const docsPath = 'docs-v2/integrations/all';
const snippetsPath = 'docs-v2/snippets/generated';

const flows = yaml.load(await fs.readFile(flowsPath, 'utf-8')) as any;
const providers = yaml.load(await fs.readFile(providersPath, 'utf-8')) as Record<string, Provider>;

const useCases: Record<string, any> = {};
for (const [integration, config] of Object.entries<any>(flows.integrations)) {
    useCases[integration] = buildEndpoints('action', config.actions, integration).concat(buildEndpoints('sync', config.syncs, integration));
}

const files = await fs.readdir(docsPath);
for (const file of files) {
    if (file.endsWith('.mdx')) {
        const filePath = path.join(docsPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // find the integration line
        const providerLine = lines.find((line) => line.startsWith('provider: '));
        if (!providerLine) {
            throw new Error(`No provider line found in ${file}`);
        }

        const provider = providerLine.split('provider: ')[1]?.trim();
        if (!provider) {
            throw new Error(`Couldn't parse provider from ${file}`);
        }
        const snippetPath = `${snippetsPath}/${path.basename(file, '.mdx')}`;

        await fs.mkdir(snippetPath, { recursive: true });

        const providerConfig: Provider | undefined = providers[(providers[provider] as any)?.['alias']] || providers[provider];
        if (!providerConfig) {
            throw new Error("Couldn't find provider config for " + provider);
        }

        const toolingSnippet = preBuiltToolingSnippet(providerConfig, useCases[provider]);
        await fs.writeFile(`${snippetPath}/PreBuiltTooling.mdx`, toolingSnippet, 'utf-8');

        const casesSnippet = useCasesSnippet(useCases[provider]);
        await fs.writeFile(`${snippetPath}/PreBuiltUseCases.mdx`, casesSnippet, 'utf-8');
    }
}

function preBuiltToolingSnippet(providerConfig: Provider, useCases: any) {
    const prettyAuthMode = prettyAuthModes[providerConfig.auth_mode];
    const hasAuthParams = !!providerConfig.authorization_params;
    const hasAuthGuide = !!providerConfig.docs_connect;
    const hasUseCases = useCases && useCases.length > 0;
    const hasWebHooks = !!providerConfig.webhook_routing_script;
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
        `| End-to-type type safety | ✅ |`,
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

    return `
        ## Pre-built integrations

        <AccordionGroup>

            ${Object.values(sortedGroups)
                .map(
                    (group) => `
                        <Accordion title="${group[0]?.group ?? 'Others'}">
                        | Endpoint | Description | Readme |
                        | - | - | - |
                        ${group
                            .map(
                                (endpoint) =>
                                    `| \`${endpoint.method} ${endpoint.path}\` | ${endpoint.description?.replaceAll('\n', '<br />') ?? ''} | [🔗](https://github.com/NangoHQ/integration-templates/blob/main/integrations/${endpoint.script}.md) |`
                            )
                            .join('\n')}
                        </Accordion>
                `
                )
                .join('\n')}
        </AccordionGroup>

        <Tip>Not seeing the integration you need? [Build your own](https://docs.nango.dev/guides/custom-integrations/overview) independently.</Tip>
    `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
}

function emptyUseCases() {
    return `## Pre-built integrations

        _No pre-built integration yet (time to contribute: &lt;48h)_

        <Tip>Not seeing the integration you need? [Build your own](https://docs.nango.dev/guides/custom-integrations/overview) independently.</Tip>
    `
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
}

interface Endpoint {
    method: string;
    path: string;
    description: string;
    group: string;
    script: string;
}

function buildEndpoints(type: string, syncOrAction: any, integration: string) {
    const endpoints: Endpoint[] = [];
    if (syncOrAction) {
        for (const [key, item] of Object.entries<any>(syncOrAction)) {
            if (!item?.endpoint) {
                continue;
            }

            const currentEndpoints = Array.isArray(item.endpoint) ? item?.endpoint : [item?.endpoint];
            for (const endpoint of currentEndpoints) {
                endpoints.push({
                    method: endpoint?.method,
                    path: endpoint?.path,
                    description: item?.description?.trim(),
                    group: endpoint?.group,
                    script: `${integration}/${type}s/${key}`
                });
            }
        }
    }

    return endpoints;
}
