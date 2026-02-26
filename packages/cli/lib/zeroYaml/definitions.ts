import path from 'node:path';
import { pathToFileURL } from 'url';

import * as z from 'zod';

import { getInterval } from '@nangohq/nango-yaml';

import { getEntryPoints, readIndexContent, tsToJsPath } from './compile.js';
import {
    DuplicateEndpointDefinitionError,
    EndpointMismatchDefinitionError,
    InvalidIntervalDefinitionError,
    InvalidModelDefinitionError,
    TrackDeletesDefinitionError
} from './utils.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';

import type { CreateActionResponse, CreateOnEventResponse, CreateSyncResponse } from '@nangohq/runner-sdk';
import type { ZodMetadata, ZodModel } from '@nangohq/runner-sdk/lib/types.js';
import type { NangoYamlParsed, NangoYamlParsedIntegration, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const allowed = ['action', 'sync', 'onEvent'];

/**
 * Generate a per-function JSON Schema from named Zod schemas.
 * Uses zod v4's built-in toJSONSchema to avoid the NangoModel intermediate.
 * Void schemas are skipped — they cannot be represented in JSON Schema
 * and indicate an absent input/output.
 */
function buildFunctionJsonSchema(namedSchemas: Record<string, z.ZodType>): JSONSchema7 {
    const definitions: Record<string, JSONSchema7> = {};
    for (const [name, schema] of Object.entries(namedSchemas)) {
        if (schema.constructor.name === 'ZodVoid') {
            continue;
        }
        const def = z.toJSONSchema(schema, { target: 'draft-7' }) as JSONSchema7;
        delete (def as Record<string, unknown>)['$schema'];
        definitions[name] = def;
    }
    return { $schema: 'http://json-schema.org/draft-07/schema#', definitions };
}

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
        const moduleUrl = pathToFileURL(modulePath).href;
        const moduleContent = await import(moduleUrl);
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
                onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [], 'validate-connection': [] }
            };
            parsed.integrations.push(integration);
        }

        switch (script.type) {
            case 'sync': {
                const resBuild = buildSync({ filePath: realPath, params: script, integrationIdClean, basename, basenameClean });
                if (resBuild.isErr()) {
                    return Err(resBuild.error);
                }
                integration.syncs.push(resBuild.value.sync);
                break;
            }
            case 'action': {
                const def = buildAction({ params: script, integrationIdClean, basename, basenameClean });
                integration.actions.push(def.action);
                break;
            }
            case 'onEvent': {
                if (script.event === 'post-connection-creation') {
                    integration.onEventScripts['post-connection-creation'].push(basename);
                } else if (script.event === 'pre-connection-deletion') {
                    integration.onEventScripts['pre-connection-deletion'].push(basename);
                } else if (script.event === 'validate-connection') {
                    integration.onEventScripts['validate-connection'].push(basename);
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
}): Result<{ sync: ParsedNangoSync }> {
    const usedModels = new Set(Object.keys(params.models));
    const metadataName = params.metadata ? `SyncMetadata_${integrationIdClean}_${basenameClean}` : null;
    if (metadataName) {
        usedModels.add(metadataName);
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

    const namedSchemas: Record<string, z.ZodType> = {};
    if (metadataName && params.metadata) {
        namedSchemas[metadataName] = params.metadata as z.ZodType;
    }

    const outputNames: string[] = [];
    for (const [name, model] of Object.entries(params.models)) {
        usedModels.add(name);
        outputNames.push(name);
        namedSchemas[name] = model as z.ZodType;
    }

    const sync: ParsedNangoSync = {
        type: 'sync',
        description: params.description,
        auto_start: params.autoStart === true,
        endpoints: params.endpoints,
        input: metadataName || null,
        name: basename,
        output: outputNames,
        runs: params.frequency,
        scopes: params.scopes || [],
        sync_type: params.syncType || 'full',
        track_deletes: params.trackDeletes === true,
        usedModels: Array.from(usedModels.values()),
        version: params.version || '',
        webhookSubscriptions: params.webhookSubscriptions || [],
        json_schema: buildFunctionJsonSchema(namedSchemas)
    };
    return Ok({ sync });
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
}): { action: ParsedNangoAction } {
    const inputName = `ActionInput_${integrationIdClean}_${basenameClean}`;
    const outputName = `ActionOutput_${integrationIdClean}_${basenameClean}`;

    const action: ParsedNangoAction = {
        type: 'action' as const,
        description: params.description,
        endpoint: params.endpoint,
        input: inputName,
        name: basename,
        output: [outputName],
        scopes: params.scopes || [],
        usedModels: [inputName, outputName],
        version: params.version || '',
        json_schema: buildFunctionJsonSchema({
            [inputName]: params.input,
            [outputName]: params.output
        })
    };
    return { action };
}

function postValidation(parsed: NangoYamlParsed): Result<void> {
    for (const integration of parsed.integrations) {
        const seenEndpoints = new Set<string>();

        for (const sync of integration.syncs) {
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
