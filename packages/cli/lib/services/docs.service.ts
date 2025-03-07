import { promises as fs } from 'node:fs';
import { parse } from './config.service.js';
import type { NangoYamlV2Endpoint, NangoYamlModel, NangoYamlV2IntegrationSync, NangoYamlV2IntegrationAction } from '@nangohq/types';
import chalk from 'chalk';
import { printDebug } from '../utils.js';

type NangoSyncOrAction = NangoYamlV2IntegrationSync | NangoYamlV2IntegrationAction;

const divider = '<!-- END  GENERATED CONTENT -->';

export async function generate({
    absolutePath,
    path,
    isForIntegrationTemplates = false,
    debug = false
}: {
    absolutePath: string;
    path?: string;
    debug?: boolean;
    isForIntegrationTemplates?: false;
}): Promise<boolean> {
    const pathPrefix = path && path.startsWith('/') ? path.slice(1) : path;
    const parsing = parse(absolutePath, debug);

    if (parsing.isErr()) {
        console.log(chalk.red(`Error parsing nango.yaml: ${parsing.error}`));
        return false;
    }
    const yamlConfig = parsing.value.raw;
    const writePath = pathPrefix ? `${absolutePath}/${pathPrefix}` : absolutePath;

    if (debug) {
        printDebug(`Generating readme files in ${writePath}`);
    }

    if (debug && !(await directoryExists(writePath))) {
        printDebug(`Creating the directory at ${writePath}`);
    }

    await fs.mkdir(writePath, { recursive: true });

    const integrations = yamlConfig.integrations;
    for (const integration of Object.keys(integrations)) {
        const models = yamlConfig.models || {};
        const config = integrations[integration];

        const toGenerate: [string, string, string, NangoSyncOrAction][] = [];

        toGenerate.push(
            ...Object.entries(config?.syncs || {}).map<[string, string, string, NangoSyncOrAction]>(([key, sync]) => ['sync', integration, key, sync])
        );
        toGenerate.push(
            ...Object.entries(config?.actions || {}).map<[string, string, string, NangoSyncOrAction]>(([key, action]) => ['action', integration, key, action])
        );

        for (const [type, integration, key, config] of toGenerate) {
            const scriptPath = `${integration}/${type}s/${key}`;
            try {
                const filename = path ? `${writePath}/${key}.md` : `${writePath}/${scriptPath}.md`;

                let markdown;
                try {
                    markdown = await fs.readFile(filename, 'utf8');
                } catch {
                    markdown = '';
                }

                const updatedMarkdown = updateReadme(markdown, key, scriptPath, type, config, models, isForIntegrationTemplates);
                await fs.writeFile(path ? `${writePath}/${key}.md` : `${writePath}/${scriptPath}.md`, updatedMarkdown);
            } catch {
                console.error(`Error generating readme for ${integration} ${type} ${key}`);
                return false;
            }
        }
    }

    return true;
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

function updateReadme(
    markdown: string,
    scriptName: string,
    scriptPath: string,
    endpointType: string,
    scriptConfig: NangoSyncOrAction,
    models: NangoYamlModel,
    isForIntegrationTemplates: boolean
): string {
    const [, custom = ''] = markdown.split(divider);

    const prettyName = scriptName
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const generatedLines = [
        `<!-- BEGIN GENERATED CONTENT -->`,
        `# ${prettyName}`,
        ``,
        generalInfo(scriptPath, endpointType, scriptConfig, isForIntegrationTemplates),
        ``,
        '## Endpoint Reference',
        ``,
        requestEndpoint(scriptConfig),
        requestParams(endpointType),
        requestBody(scriptConfig, endpointType, models),
        requestResponse(scriptConfig, models)
    ];
    const metadata = expectedMetadata(scriptConfig, endpointType, models);
    if (metadata) {
        generatedLines.push(metadata);
    }

    if (isForIntegrationTemplates) {
        generatedLines.push(changelog(scriptPath));
    }

    return `${generatedLines.join('\n')}\n${divider}\n${custom.trim()}\n`;
}

function generalInfo(scriptPath: string, endpointType: string, scriptConfig: NangoSyncOrAction, isForIntegrationTemplates: boolean) {
    const scopes = Array.isArray(scriptConfig.scopes) ? scriptConfig.scopes.join(', ') : scriptConfig.scopes;

    if (!scriptConfig.description) {
        console.warn(`Warning: no description for ${scriptPath}`);
    }

    const endpoints = Array.isArray(scriptConfig.endpoint) ? scriptConfig.endpoint : [scriptConfig.endpoint];
    const [endpoint] = endpoints;

    const generalInfo = [
        `## General Information`,
        ``,
        `- **Description:** ${scriptConfig.description ?? ''}`,
        `- **Version:** ${scriptConfig.version ? scriptConfig.version : '0.0.1'}`,
        `- **Group:** ${endpoint && typeof endpoint !== 'string' && 'group' in endpoint ? endpoint?.group : 'Others'}`,
        `- **Scopes:** ${scopes ? `\`${scopes}\`` : '_None_'}`,
        `- **Endpoint Type:** ${endpointType.slice(0, 1).toUpperCase()}${endpointType.slice(1)}`
    ];

    if (isForIntegrationTemplates) {
        generalInfo.push(`- **Code:** [github.com](https://github.com/NangoHQ/integration-templates/tree/main/integrations/${scriptPath}.ts)`);
    }

    generalInfo.push(``);

    return generalInfo.join('\n');
}

function requestEndpoint(scriptConfig: NangoSyncOrAction) {
    const rawEndpoints = Array.isArray(scriptConfig.endpoint) ? scriptConfig.endpoint : [scriptConfig.endpoint];
    const endpoints = rawEndpoints.map((endpoint: NangoYamlV2Endpoint | string) =>
        typeof endpoint !== 'string' ? `\`${endpoint?.method || 'GET'} ${endpoint?.path}\`` : ''
    );

    return ['### Request Endpoint', ``, endpoints.join(', '), ``].join('\n');
}

function requestParams(endpointType: string) {
    const out = ['### Request Query Parameters'];

    if (endpointType === 'sync') {
        out.push(
            ``,
            `- **modified_after:** \`(optional, string)\` A timestamp (e.g., \`2023-05-31T11:46:13.390Z\`) used to fetch records modified after this date and time. If not provided, all records are returned. The modified_after parameter is less precise than cursor, as multiple records may share the same modification timestamp.`,
            `- **limit:** \`(optional, integer)\` The maximum number of records to return per page. Defaults to 100.`,
            `- **cursor:** \`(optional, string)\` A marker used to fetch records modified after a specific point in time.If not provided, all records are returned.Each record includes a cursor value found in _nango_metadata.cursor.Save the cursor from the last record retrieved to track your sync progress.Use the cursor parameter together with the limit parameter to paginate through records.The cursor is more precise than modified_after, as it can differentiate between records with the same modification timestamp.`,
            `- **filter:** \`(optional, added | updated | deleted)\` Filter to only show results that have been added or updated or deleted.`,
            `- **ids:** \`(optional, string[])\` An array of string containing a list of your records IDs. The list will be filtered to include only the records with a matching ID.`,
            ``
        );
    } else {
        out.push(``, `_No request parameters_`, ``);
    }

    return out.join('\n');
}

function requestBody(scriptConfig: NangoSyncOrAction, endpointType: string, models: NangoYamlModel) {
    const out = ['### Request Body'];

    if (endpointType === 'action' && scriptConfig.input) {
        let expanded = expandModels(scriptConfig.input, models);
        if (Array.isArray(expanded)) {
            expanded = { input: expanded } as unknown as NangoYamlModel;
        }
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, `\`\`\`json`, ...expandedLines, `\`\`\``, ``);
    } else {
        out.push(``, `_No request body_`, ``);
    }

    return out.join('\n');
}

function requestResponse(scriptConfig: NangoSyncOrAction, models: NangoYamlModel) {
    const out = ['### Request Response'];

    const scriptOutput = Array.isArray(scriptConfig.output) ? scriptConfig.output[0] : scriptConfig.output;

    if (scriptOutput) {
        const expanded = expandModels(scriptOutput, models);
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, `\`\`\`json`, ...expandedLines, `\`\`\``, ``);
    } else {
        out.push(``, `_No request response_`, ``);
    }

    return out.join('\n');
}

function expectedMetadata(scriptConfig: any, endpointType: string, models: NangoYamlModel) {
    if (endpointType === 'sync' && scriptConfig.input) {
        const out = ['### Expected Metadata'];

        const expanded = expandModels(scriptConfig.input, models);
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, `\`\`\`json`, ...expandedLines, `\`\`\``, ``);

        return out.join('\n');
    }
    return;
}

function changelog(scriptPath: string) {
    return [
        '## Changelog',
        ``,
        `- [Script History](https://github.com/NangoHQ/integration-templates/commits/main/integrations/${scriptPath}.ts)`,
        `- [Documentation History](https://github.com/NangoHQ/integration-templates/commits/main/integrations/${scriptPath}.md)`,
        ``
    ].join('\n');
}

function expandModels(model: string | NangoYamlModel, models: NangoYamlModel): NangoYamlModel | NangoYamlModel[] {
    if (typeof model === 'undefined' || model === null) {
        return [];
    }

    if (typeof model === 'string') {
        if (model.endsWith('[]')) {
            return [expandModels(model.slice(0, -2), models)] as NangoYamlModel[];
        }

        if (models[model]) {
            model = models[model] as NangoYamlModel;
        } else {
            model = `<${model}>`;
        }
    }

    if (typeof model === 'object') {
        if ('__extends' in model) {
            const extension = model['__extends'];
            if (typeof extension === 'string') {
                model = { ...models[extension], ...model } as NangoYamlModel;
                delete (model as Record<string, unknown>)['__extends'];
            }
        }

        model = Object.fromEntries(
            Object.entries(model).map(([key, value]) => {
                return [key, expandModels(value as NangoYamlModel, models)];
            })
        ) as NangoYamlModel;
    }

    return model as NangoYamlModel;
}
