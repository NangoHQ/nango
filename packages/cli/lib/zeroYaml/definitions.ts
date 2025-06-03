import fs from 'node:fs/promises';
import path from 'node:path';

import { zodToNangoModelField } from './zodToNango.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { tsToJsPath } from './compile.js';

import type { CreateActionResponse, CreateOnEventResponse, CreateSyncResponse } from '@nangohq/runner-sdk';
import type { ZodModel } from '@nangohq/runner-sdk/lib/types.js';
import type { NangoModel, NangoModelField, NangoYamlParsed, NangoYamlParsedIntegration, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';

const allowed = ['action', 'sync', 'onEvent'];
const importRegex = /^import ['"](.+)['"];?$/gm;

export async function buildDefinitions({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<NangoYamlParsed>> {
    const indexPath = path.join(fullPath, 'index.ts');
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const parsed: NangoYamlParsed = { yamlVersion: 'v2', integrations: [], models: new Map() };

    printDebug('Rebuilding parsed from js files', debug);

    const matched = indexContent.matchAll(importRegex);
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
            return Err(new Error(`Script should be declared using utility function (createSync, createAction, createOnEvent) ${modulePath}`));
        }

        printDebug(`Parsing ${filePath}`, debug);

        const script = moduleContent.default.default as
            | CreateSyncResponse<Record<string, ZodModel>, Zod.ZodTypeAny>
            | CreateActionResponse<Zod.ZodTypeAny, Zod.ZodTypeAny, Zod.ZodTypeAny>
            | CreateOnEventResponse;

        const basename = path.basename(filePath, '.js');
        const basenameClean = basename.replaceAll(/[^a-zA-Z0-9]/g, '');
        const split = filePath.split('/');
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
                const def = buildSync({ params: script, integrationIdClean, basename, basenameClean });
                integration.syncs.push(def.sync);
                def.models.forEach((v, k) => {
                    parsed.models.set(k, v);
                });
                break;
            }
            case 'action': {
                const def = buildAction({ params: script, integrationIdClean, basename, basenameClean });
                integration.actions.push(def.action);
                def.models.forEach((v, k) => {
                    parsed.models.set(k, v);
                });
                break;
            }
            case 'onEvent': {
                if (script.event === 'post-connection-creation') {
                    integration.onEventScripts['post-connection-creation'].push(basename);
                } else if (script.event === 'pre-connection-deletion') {
                    integration.onEventScripts['pre-connection-deletion'].push(basename);
                }
                break;
            }
        }
    }

    if (num === 0) {
        return Err(new Error('No export in index.ts'));
    }

    printDebug('Correctly parsed', debug);

    return Ok(parsed);
}

export function buildSync({
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    params: CreateSyncResponse<Record<string, ZodModel>, Zod.ZodTypeAny>;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): { sync: ParsedNangoSync; models: Map<string, NangoModel> } {
    const models = new Map<string, NangoModel>();
    const usedModels = new Set(Object.keys(params.models));
    const metadata = params.metadata ? zodToNangoModelField(`SyncMetadata_${integrationIdClean}_${basenameClean}`, params.metadata) : null;
    if (metadata) {
        usedModels.add(metadata.name);
        if (!Array.isArray(metadata.value)) {
            models.set(metadata.name, { name: metadata.name, fields: [{ ...metadata, name: 'metadata' }], isAnon: true });
        } else {
            models.set(metadata.name, { name: metadata.name, fields: metadata.value });
        }
    }

    const sync: ParsedNangoSync = {
        type: 'sync',
        description: params.description,
        auto_start: params.autoStart === true,
        endpoints: params.endpoints,
        input: metadata?.name || null,
        name: basename,
        output: Object.entries(params.models).map(([name, model]) => {
            const to = zodToNangoModelField(name, model);
            models.set(name, { name, fields: to['value'] as NangoModelField[] });
            usedModels.add(name);
            return name;
        }),
        runs: params.frequency,
        scopes: params.scopes || [],
        sync_type: params.syncType,
        track_deletes: params.trackDeletes === true,
        usedModels: Array.from(usedModels.values()),
        version: params.version || '0.0.1',
        webhookSubscriptions: params.webhookSubscriptions || []
    };
    return { sync, models };
}

export function buildAction({
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    params: CreateActionResponse<Zod.ZodTypeAny, Zod.ZodTypeAny, Zod.ZodTypeAny>;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): { action: ParsedNangoAction; models: Map<string, NangoModel> } {
    const models = new Map<string, NangoModel>();
    const input = zodToNangoModelField(`ActionInput_${integrationIdClean}_${basenameClean}`, params.input);
    if (!Array.isArray(input.value)) {
        models.set(input.name, { name: input.name, fields: [{ ...input, name: 'input' }], isAnon: true });
    } else {
        models.set(input.name, { name: input.name, fields: input.value });
    }

    const output = zodToNangoModelField(`ActionOutput_${integrationIdClean}_${basenameClean}`, params.output);
    if (!Array.isArray(output.value)) {
        models.set(output.name, { name: output.name, fields: [{ ...output, name: 'output' }], isAnon: true });
    } else {
        models.set(output.name, { name: output.name, fields: output.value });
    }

    const action: ParsedNangoAction = {
        type: 'action' as const,
        description: params.description,
        endpoint: params.endpoint,
        input: input.name,
        name: basename,
        output: [output.name],
        scopes: params.scopes || [],
        usedModels: [input.name, output.name],
        version: params.version || '0.0.1'
    };
    return { action, models };
}
