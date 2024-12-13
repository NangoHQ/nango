import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const flowsPath = 'packages/shared/flows.yaml';
const docsPath = 'docs-v2/integrations/all';
const snippetsPath = 'docs-v2/snippets/generated';

const flows = yaml.load(await fs.readFile(flowsPath, 'utf-8')) as any;

const useCases: Record<string, any> = {};
for (const [integration, config] of Object.entries<any>(flows.integrations)) {
    useCases[integration] = buildEndpoints(config.actions, integration).concat(buildEndpoints(config.syncs, integration));
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

        const casesSnippet = useCasesSnippet(useCases[provider]);
        await fs.writeFile(`${snippetPath}/PreBuiltUseCases.mdx`, casesSnippet, 'utf-8');
    }
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
        ## Pre-built use cases
        
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

interface Endpoint {
    method: string;
    path: string;
    description: string;
    group: string;
    script: string;
}

function buildEndpoints(syncOrAction: any, integration: string) {
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
                    script: `${integration}/actions/${key}`
                });
            }
        }
    }

    return endpoints;
}
