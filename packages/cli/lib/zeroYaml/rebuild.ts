import fs from 'node:fs/promises';
import path from 'node:path';

import { zodToNangoModelField } from './zodToNango.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { tsToJsPath } from './compile.js';

import type { CreateActionResponse, CreateOnEventResponse, CreateSyncResponse } from '@nangohq/runner-sdk';
import type { NangoModelField, NangoYamlParsed, NangoYamlParsedIntegration, Result } from '@nangohq/types';

const allowed = ['action', 'sync', 'on-events'];
const exportRegex = /^export \* from ['"](.+)['"];?$/gm;

export async function rebuildParsed({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<NangoYamlParsed>> {
    const indexPath = path.join(fullPath, 'index.ts');
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const parsed: NangoYamlParsed = { yamlVersion: 'v2', integrations: [], models: new Map() };

    printDebug('Rebuilding parsed from js files', debug);

    const matched = indexContent.matchAll(exportRegex);
    let num = 0;

    for (const match of matched) {
        const filePath = match[1];
        if (!filePath) {
            continue;
        }

        num += 1;

        const modulePath = path.join(fullPath, 'build', tsToJsPath(filePath));
        const moduleContent = await import(modulePath);
        if (!moduleContent.default || !moduleContent.default.default) {
            return Err(new Error(`Script should have a default export ${modulePath}`));
        }
        if (!moduleContent.default.default.type || !allowed.includes(moduleContent.default.default.type)) {
            return Err(new Error(`Script should be declared using utility function (createSync, createAction, etc.) ${modulePath}`));
        }

        printDebug(`Parsing ${filePath}`, debug);

        const script = moduleContent.default.default as
            | CreateSyncResponse<Record<string, Zod.ZodObject<any>>, Zod.ZodObject<any>>
            | CreateActionResponse<Zod.ZodAny, Zod.ZodAny>
            | CreateOnEventResponse;

        const basename = path.basename(modulePath, '.cjs');
        const basenameClean = basename.replaceAll(/[^a-zA-Z0-9]/g, '');
        const split = modulePath.split('/');
        const integrationId = split[split.length - 3]!;
        const integrationIdClean = integrationId.replaceAll(/[^a-zA-Z0-9]/g, '_');

        let integration: NangoYamlParsedIntegration | undefined = parsed.integrations.find((v) => v.providerConfigKey === integrationId);
        if (!integration) {
            integration = {
                providerConfigKey: integrationId,
                actions: [],
                syncs: [],
                onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [] }
            };
            parsed.integrations.push(integration);
        }

        switch (script.type) {
            case 'sync': {
                const params = script.params;
                const usedModels: string[] = [...Object.keys(params.models)];
                const metadata = params.metadata ? zodToNangoModelField(`SyncMetadata_${integrationIdClean}_${basenameClean}`, params.metadata) : null;
                if (metadata) {
                    usedModels.push(metadata.name);
                    parsed.models.set(metadata.name, { name: metadata.name, fields: metadata.value as NangoModelField[] });
                }

                integration.syncs.push({
                    type: 'sync',
                    description: params.description,
                    auto_start: params.autoStart === true,
                    endpoints: params.endpoints,
                    input: metadata?.name || null,
                    name: basename,
                    output: Object.entries(params.models).map(([name, model]) => {
                        const to = zodToNangoModelField(name, model);
                        parsed.models.set(name, { name, fields: to['value'] as NangoModelField[] });
                        usedModels.push(name);
                        return name;
                    }),
                    runs: params.runs,
                    scopes: params.scopes || [],
                    sync_type: params.syncType,
                    track_deletes: params.trackDeletes === true,
                    usedModels,
                    version: params.version || '0.0.1',
                    webhookSubscriptions: params.webhookSubscriptions || []
                });
                break;
            }
            case 'action': {
                const params = script.params;
                const input = zodToNangoModelField(`ActionInput_${integrationIdClean}_${basenameClean}`, params.input);
                parsed.models.set(input.name, { name: input.name, fields: input.value as NangoModelField[] });

                const output = zodToNangoModelField(`ActionOutput_${integrationIdClean}_${basenameClean}`, params.output);
                parsed.models.set(output.name, { name: output.name, fields: input.value as NangoModelField[] });
                integration.actions.push({
                    type: 'action',
                    description: params.description,
                    endpoint: params.endpoint,
                    input: input.name,
                    name: basename,
                    output: [output.name],
                    scopes: params.scopes || [],
                    usedModels: [input.name, output.name],
                    version: params.version || '0.0.1'
                });
                break;
            }
            case 'on-event': {
                if (script.params.event === 'post-connection-creation') {
                    integration.onEventScripts['post-connection-creation'].push(basename);
                } else if (script.params.event === 'pre-connection-deletion') {
                    integration.onEventScripts['pre-connection-deletion'].push(basename);
                }
            }
        }
    }

    if (num === 0) {
        return Err(new Error('No export in index.ts'));
    }

    printDebug('Correctly parsed', debug);

    return Ok(parsed);
}
