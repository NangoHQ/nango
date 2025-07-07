import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import path from 'node:path';

import { printDebug } from '../utils.js';
import { loadSchemaJson } from './model.service.js';

import type { NangoYamlParsed, ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';
import type { JSONSchema7Definition, JSONSchema7 } from 'json-schema';

type NangoSyncOrAction = ParsedNangoSync | ParsedNangoAction;

const divider = '<!-- END  GENERATED CONTENT -->';

export async function generate({
    absolutePath,
    path: subPath,
    parsed,
    isForIntegrationTemplates = false,
    debug = false
}: {
    absolutePath: string;
    parsed: NangoYamlParsed;
    path?: string;
    debug?: boolean;
    isForIntegrationTemplates?: false;
}): Promise<boolean> {
    const pathPrefix = subPath && subPath.startsWith('/') ? subPath.slice(1) : subPath;
    const writePath = pathPrefix ? `${absolutePath}/${pathPrefix}` : absolutePath;

    if (debug) {
        printDebug(`Generating readme files in ${writePath}`);
    }

    if (debug && !(await directoryExists(writePath))) {
        printDebug(`Creating the directory at ${writePath}`);
    }

    await fs.mkdir(writePath, { recursive: true });
    const getSchema = createSchemaResolver(absolutePath);
    const integrations = parsed.integrations;
    for (const config of integrations) {
        const integration = config.providerConfigKey;

        const jsonSchema = getSchema(integration);
        if (!jsonSchema) {
            return false;
        }

        const toGenerate: NangoSyncOrAction[] = [...Object.values(config.syncs), ...Object.values(config.actions)];

        for (const entry of toGenerate) {
            const scriptPath = `${integration}/${entry.type}s/${entry.name}`;
            try {
                const filename = subPath ? `${writePath}/${entry.name}.md` : `${writePath}/${scriptPath}.md`;

                let markdown;
                try {
                    markdown = await fs.readFile(filename, 'utf8');
                } catch {
                    markdown = '';
                }

                const updatedMarkdown = updateReadme({
                    markdown,
                    scriptName: entry.name,
                    scriptPath,
                    endpointType: entry.type,
                    scriptConfig: entry,
                    models: entry.usedModels.map((name) => ({ name, def: jsonSchema.definitions![name]! })),
                    isForIntegrationTemplates
                });
                await fs.writeFile(subPath ? `${writePath}/${entry.name}.md` : `${writePath}/${scriptPath}.md`, updatedMarkdown);
            } catch {
                console.error(`Error generating readme for ${integration} ${entry.type} ${entry.name}`);
                return false;
            }
        }
    }

    return true;
}

function createSchemaResolver(absolutePath: string): (integration: string) => JSONSchema7 | null {
    const globalResult = loadSchemaJson({ fullPath: absolutePath, suppressErrors: true });

    return (integration: string) => {
        const integrationPath = path.join(absolutePath, integration);
        const integrationResult = loadSchemaJson({ fullPath: integrationPath, suppressErrors: true });
        if (integrationResult.schema) {
            return integrationResult.schema;
        }
        if (globalResult.schema) {
            return globalResult.schema;
        }

        if (integrationResult.error) {
            console.error(chalk.red(`Error loading ${integrationPath}`), integrationResult.error);
        }
        if (globalResult.error) {
            console.error(chalk.red(`Error loading ${absolutePath}`), globalResult.error);
        }

        return null;
    };
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

function updateReadme({
    markdown,
    scriptName,
    scriptPath,
    endpointType,
    scriptConfig,
    models,
    isForIntegrationTemplates
}: {
    markdown: string;
    scriptName: string;
    scriptPath: string;
    endpointType: string;
    scriptConfig: NangoSyncOrAction;
    models: { name: string; def: JSONSchema7Definition }[];
    isForIntegrationTemplates: boolean;
}): string {
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
    if (scriptConfig.type === 'sync') {
        const metadata = expectedMetadata(scriptConfig, endpointType, models);
        if (metadata) {
            generatedLines.push(metadata);
        }
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

    const endpoints = scriptConfig.type === 'action' ? [scriptConfig.endpoint] : scriptConfig.endpoints;
    const [endpoint] = endpoints;

    const modelList = Array.isArray(scriptConfig.output) ? scriptConfig.output : [scriptConfig.output];
    const models = modelList.length > 0 ? modelList.map((model) => `\`${model}\``).join(', ') : '_None_';
    const modelLabel = modelList.length > 1 ? 'Models' : 'Model';

    const inputModelList =
        endpointType === 'action' && scriptConfig.input ? (Array.isArray(scriptConfig.input) ? scriptConfig.input : [scriptConfig.input]) : [];
    const inputModels = inputModelList.length > 0 ? inputModelList.map((model) => `\`${model}\``).join(', ') : '_None_';

    const generalInfo = [
        `## General Information`,
        ``,
        `- **Description:** ${scriptConfig.description ?? ''}`,
        `- **Version:** ${scriptConfig.version ? scriptConfig.version : '0.0.1'}`,
        `- **Group:** ${endpoint && typeof endpoint !== 'string' && 'group' in endpoint ? endpoint?.group : 'Others'}`,
        `- **Scopes:** ${scopes ? `\`${scopes}\`` : '_None_'}`,
        `- **Endpoint Type:** ${endpointType.slice(0, 1).toUpperCase()}${endpointType.slice(1)}`,
        `- **${modelLabel}:** ${models}`
    ];

    if (endpointType === 'action') {
        generalInfo.push(`- **Input Model${inputModelList.length > 1 ? 's' : ''}:** ${inputModels}`);
    }

    if (isForIntegrationTemplates) {
        generalInfo.push(`- **Code:** [github.com](https://github.com/NangoHQ/integration-templates/tree/main/integrations/${scriptPath}.ts)`);
    }

    generalInfo.push(``);

    return generalInfo.join('\n');
}

function requestEndpoint(scriptConfig: NangoSyncOrAction) {
    const rawEndpoints = scriptConfig.type === 'sync' ? scriptConfig.endpoints : [scriptConfig.endpoint];
    const endpoints = rawEndpoints.map((endpoint) => (typeof endpoint !== 'string' ? `\`${endpoint?.method || 'GET'} ${endpoint?.path}\`` : ''));

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

function requestBody(scriptConfig: NangoSyncOrAction, endpointType: string, models: { name: string; def: JSONSchema7Definition }[]) {
    const out = ['### Request Body'];

    if (endpointType === 'action' && scriptConfig.input) {
        const inputName = Array.isArray(scriptConfig.input) ? scriptConfig.input[0] : scriptConfig.input;
        const expanded = modelToJson({ model: models.find((m) => m.name === inputName)!.def, models });
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, '```json', ...expandedLines, '```', '');
    } else {
        out.push(``, `_No request body_`, ``);
    }

    return out.join('\n');
}

function requestResponse(scriptConfig: NangoSyncOrAction, models: { name: string; def: JSONSchema7Definition }[]) {
    const out = ['### Request Response'];

    const scriptOutput = Array.isArray(scriptConfig.output) ? scriptConfig.output[0] : scriptConfig.output;
    if (scriptOutput) {
        const expanded = modelToJson({ model: models.find((m) => m.name === scriptOutput)!.def, models });
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, '```json', ...expandedLines, '```', '');
    } else {
        out.push(``, `_No request response_`, ``);
    }

    return out.join('\n');
}

function expectedMetadata(scriptConfig: ParsedNangoSync, endpointType: string, models: { name: string; def: JSONSchema7Definition }[]) {
    if (endpointType === 'sync' && scriptConfig.input) {
        const out = ['### Expected Metadata'];
        const expanded = modelToJson({ model: models.find((m) => m.name === scriptConfig.input)!.def, models });
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, '```json', ...expandedLines, '```', '');
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

/**
 * Transform JSONSchema to human readable JSON
 */
export function modelToJson({
    model,
    models
}: {
    model: JSONSchema7Definition;
    models: { name: string; def: JSONSchema7Definition }[];
}): Record<string, unknown> | string | string[] | Record<string, unknown>[] {
    if (!model || typeof model !== 'object') {
        return '<unknown>';
    }

    // Handle $ref (other models)
    if ('$ref' in model && typeof model['$ref'] === 'string') {
        const ref = model['$ref'];

        // JSON Schema refs are like '#/definitions/ModelName'
        const refName = ref.split('/').pop();
        const found = models.find((m) => m && m.name === refName);
        if (found) {
            return modelToJson({ model: found.def, models });
        }
        return `<${refName}>`;
    }

    // Handle union (anyOf)
    const of = model.oneOf || model.anyOf;
    if (of && Array.isArray(of)) {
        const unionTypes = of.map((subSchema) => {
            // Do not pass models for enum prop to make them readable
            // We can revisit later if we want
            const val = modelToJson({ model: subSchema, models: [] });
            if (typeof val === 'string') {
                return val;
            } else if (Array.isArray(val)) {
                return JSON.stringify(val);
            } else if (typeof val === 'object') {
                return JSON.stringify(val);
            }
            return '<unknown>';
        });
        return `<${unionTypes.join(' | ')}>`;
    }

    // Handle enums
    if ('enum' in model && Array.isArray(model.enum)) {
        const enumVals = model.enum.map((v) => `'${String(v as string)}'`);
        return `<enum: ${enumVals.join(' | ')}>`;
    }

    // Handle regular types
    if ('type' in model && typeof model.type === 'string') {
        switch (model.type) {
            case 'object': {
                const result: Record<string, unknown> = {};
                const properties = model.properties || {};
                for (const [key, prop] of Object.entries(properties)) {
                    result[key] = modelToJson({ model: prop, models });
                }
                return result;
            }
            case 'array': {
                const items = model.items;
                if (items) {
                    const itemExample = modelToJson({ model: items as JSONSchema7Definition, models });
                    if (typeof itemExample === 'string') {
                        return `<${itemExample.replace(/[<>]/g, '')}[]>`;
                    }
                    return [itemExample] as Record<string, unknown>[];
                }
                return '<array>';
            }
            case 'string':
                if (model.format === 'date-time') {
                    return '<Date>';
                }
                return `<${model.type}>`;
            case 'number':
            case 'integer':
            case 'boolean':
                return `<${model.type}>`;
            default:
                return `<${model.type}>`;
        }
    }
    if ('type' in model && Array.isArray(model.type)) {
        return `<${model.type.join(' | ')}>`;
    }

    // Fallback
    return '<unknown>';
}
