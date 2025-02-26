import { promises as fs } from 'node:fs';
import { load as loadYaml } from 'js-yaml';

const divider = '<!-- END  GENERATED CONTENT -->';

export async function generate({ absolutePath, path, debug = false }: { absolutePath: string; path?: string; debug?: boolean }): Promise<boolean> {
    console.log(path);
    console.log(debug);
    const yamlConfig = loadYaml(await fs.readFile(`${absolutePath}/nango.yaml`, 'utf8')) as any;

    const integrations = yamlConfig.integrations;
    for (const integration of Object.keys(integrations)) {
        const models = yamlConfig.models || {};
        const config = integrations[integration];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toGenerate: [string, string, string, any][] = [];

        toGenerate.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...Object.entries(config.syncs || {}).map<[string, string, string, any]>(([key, sync]) => ['sync', integration, key, sync])
        );
        toGenerate.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...Object.entries(config.actions || {}).map<[string, string, string, any]>(([key, action]) => ['action', integration, key, action])
        );

        for (const [type, integration, key, config] of toGenerate) {
            const scriptPath = `${integration}/${type}s/${key}`;
            try {
                const filename = `${absolutePath}/${scriptPath}.md`;

                let markdown;
                try {
                    markdown = await fs.readFile(filename, 'utf8');
                } catch {
                    markdown = '';
                }

                const updatedMarkdown = updateReadme(markdown, key, scriptPath, type, config, models);
                await fs.writeFile(`${absolutePath}/${scriptPath}.md`, updatedMarkdown);
            } catch (err: any) {
                console.error(`Error generating readme for ${integration} ${type} ${key}: ${err}`);
                return false;
            }
        }
    }

    return true;
}

function updateReadme(
    markdown: string,
    scriptName: string,
    scriptPath: string,
    endpointType: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scriptConfig: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    models: any
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
        generalInfo(scriptPath, endpointType, scriptConfig),
        ``,
        '## Endpoint Reference',
        ``,
        requestEndpoint(scriptConfig),
        requestParams(endpointType),
        requestBody(scriptConfig, endpointType, models),
        requestResponse(scriptConfig, models)
    ].join('\n');

    return `${generatedLines}\n${divider}\n${custom.trim()}\n`;
}

function generalInfo(scriptPath: string, endpointType: string, scriptConfig: any) {
    const scopes = Array.isArray(scriptConfig.scopes) ? scriptConfig.scopes.join(', ') : scriptConfig.scopes;

    if (!scriptConfig.description) {
        console.warn(`Warning: no description for ${scriptPath}`);
    }

    const endpoints = Array.isArray(scriptConfig.endpoint) ? scriptConfig.endpoint : [scriptConfig.endpoint];

    return [
        `## General Information`,
        ``,
        `- **Description:** ${scriptConfig.description ?? ''}`,
        `- **Version:** ${scriptConfig.version ? scriptConfig.version : '0.0.1'}`,
        `- **Group:** ${endpoints[0].group || 'Others'}`,
        `- **Scopes:** ${scopes ? `\`${scopes}\`` : '_None_'}`,
        `- **Endpoint Type:** ${endpointType.slice(0, 1).toUpperCase()}${endpointType.slice(1)}`,
        ``
    ].join('\n');
}

function requestEndpoint(scriptConfig: any) {
    const rawEndpoints = Array.isArray(scriptConfig.endpoint) ? scriptConfig.endpoint : [scriptConfig.endpoint];
    const endpoints = rawEndpoints.map((endpoint: any) => `\`${endpoint?.method || 'GET'} ${endpoint?.path}\``);

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
            ``
        );
    } else {
        out.push(``, `_No request parameters_`, ``);
    }

    return out.join('\n');
}

function requestBody(scriptConfig: any, endpointType: string, models: any) {
    const out = ['### Request Body'];

    if (endpointType === 'action' && scriptConfig.input) {
        let expanded = expandModels(scriptConfig.input, models);
        if (Array.isArray(expanded)) {
            expanded = { input: expanded };
        }
        const expandedLines = JSON.stringify(expanded, null, 2).split('\n');
        out.push(``, `\`\`\`json`, ...expandedLines, `\`\`\``, ``);
    } else {
        out.push(``, `_No request body_`, ``);
    }

    return out.join('\n');
}

function requestResponse(scriptConfig: any, models: any) {
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

function expandModels(model: any, models: any): any {
    if (typeof model === 'undefined' || model === null) {
        return [];
    }

    if (typeof model === 'string') {
        if (model.endsWith('[]')) {
            return [expandModels(model.slice(0, -2), models)];
        }

        if (models[model]) {
            model = models[model];
        } else {
            model = `<${model}>`;
        }
    }

    if (typeof model === 'object') {
        if (model.__extends) {
            model = { ...models[model.__extends], ...model };
            delete model.__extends;
        }

        model = Object.fromEntries(
            Object.entries(model).map(([key, value]) => {
                return [key, expandModels(value, models)];
            })
        );
    }

    return model;
}
