import path from 'node:path';

import { getInterval } from '@nangohq/nango-yaml';

import { zodToNangoModelField } from './zodToNango.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { getEntryPoints, readIndexContent, tsToJsPath } from './compile.js';
import {
    DuplicateEndpointDefinitionError,
    DuplicateModelDefinitionError,
    EndpointMismatchDefinitionError,
    InvalidIntervalDefinitionError,
    InvalidModelDefinitionError,
    TrackDeletesDefinitionError
} from './utils.js';

import type { CreateActionResponse, CreateOnEventResponse, CreateSyncResponse } from '@nangohq/runner-sdk';
import type { ZodMetadata, ZodModel } from '@nangohq/runner-sdk/lib/types.js';
import type { NangoModel, NangoModelField, NangoYamlParsed, NangoYamlParsedIntegration, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';
import type * as z from 'zod';

const allowed = ['action', 'sync', 'onEvent'];

export async function buildDefinitions({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<NangoYamlParsed>> {
    const parsed: NangoYamlParsed = { yamlVersion: 'v2', integrations: [], models: new Map() };

    printDebug('Rebuilding parsed from js files', debug);

    const indexRes = await readIndexContent(fullPath);
    if (indexRes.isErr()) {
        return Err(indexRes.error);
    }
    const matched = getEntryPoints(indexRes.value);
    let num = 0;

    for (const filePath of matched) {
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
            | CreateSyncResponse<Record<string, ZodModel>, z.ZodObject>
            | CreateActionResponse<z.ZodTypeAny, z.ZodTypeAny, z.ZodObject>
            | CreateOnEventResponse;

        const basename = path.basename(filePath, '.js');
        const realPath = filePath.replace('.js', '.ts');
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
                const resBuild = buildSync({ filePath: realPath, params: script, integrationIdClean, basename, basenameClean });
                if (resBuild.isErr()) {
                    return Err(resBuild.error);
                }
                const def = resBuild.value;
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

    const postValidationRes = postValidation(parsed);
    if (postValidationRes.isErr()) {
        return Err(postValidationRes.error);
    }

    if (num === 0) {
        return Err(new Error('No export in index.ts'));
    }

    printDebug('Correctly parsed', debug);

    return Ok(parsed);
}

const regexModelName = /^[A-Z][a-zA-Z0-9_]+$/;

export function buildSync({
    filePath,
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    filePath: string;
    params: CreateSyncResponse<Record<string, ZodModel>, ZodMetadata>;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): Result<{ sync: ParsedNangoSync; models: Map<string, NangoModel> }> {
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

    // Validation
    // TODO: We should probably share this with the backend and have a single zod validation
    const interval = getInterval(params.frequency, new Date());
    if (interval instanceof Error) {
        return Err(new InvalidIntervalDefinitionError(filePath, ['createSync', 'frequency']));
    }
    if (Object.keys(params.models).length !== params.endpoints.length) {
        return Err(new EndpointMismatchDefinitionError(filePath, ['createSync', 'endpoints']));
    }
    if (params.syncType === 'incremental' && params.trackDeletes) {
        return Err(new TrackDeletesDefinitionError(filePath, ['createSync', 'trackDeletes']));
    }

    const seen = new Set();
    for (const endpoint of params.endpoints) {
        const key = `${endpoint.method} ${endpoint.path}`;
        if (seen.has(key)) {
            return Err(new DuplicateEndpointDefinitionError(key, filePath, ['createSync', 'endpoints']));
        }
        seen.add(key);
    }

    for (const modelName of Object.keys(params.models)) {
        if (!regexModelName.test(modelName)) {
            return Err(new InvalidModelDefinitionError(modelName, filePath, ['createSync', 'models']));
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
    return Ok({ sync, models });
}

export function buildAction({
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    params: CreateActionResponse<z.ZodTypeAny, z.ZodTypeAny, z.ZodObject>;
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

function postValidation(parsed: NangoYamlParsed): Result<void> {
    for (const integration of parsed.integrations) {
        const seenEndpoints = new Set<string>();
        const seenModels = new Set<string>();

        for (const sync of integration.syncs) {
            for (const model of sync.usedModels) {
                if (seenModels.has(model)) {
                    return Err(new DuplicateModelDefinitionError(model, `${integration.providerConfigKey}/syncs/${sync.name}.ts`, ['createSync', 'input']));
                }
                seenModels.add(model);
            }

            for (const endpoint of sync.endpoints) {
                const key = `${endpoint.method} ${endpoint.path}`;
                if (seenEndpoints.has(key)) {
                    return Err(
                        new DuplicateEndpointDefinitionError(key, `${integration.providerConfigKey}/syncs/${sync.name}.ts`, ['createSync', 'endpoints'])
                    );
                }
                seenEndpoints.add(key);
            }
        }

        for (const action of integration.actions) {
            if (action.endpoint) {
                const key = `${action.endpoint.method} ${action.endpoint.path}`;
                if (seenEndpoints.has(key)) {
                    return Err(
                        new DuplicateEndpointDefinitionError(key, `${integration.providerConfigKey}/actions/${action.name}.ts`, ['createAction', 'endpoint'])
                    );
                }
                seenEndpoints.add(key);
            }
        }
    }
    return Ok(undefined);
}
