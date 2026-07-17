import path from 'node:path';
import { pathToFileURL } from 'url';

import { getInterval } from '@nangohq/nango-yaml';
import { deriveFunctionCapabilities } from '@nangohq/runner-sdk';

import { printDebug } from '../utils.js';
import { Err, Ok } from '../utils/result.js';
import { detectFeatures, getEntryPoints, readIndexContent, tsToJsPath } from './compile.js';
import { buildJsonSchemaDefinitionsFromZodModels } from './json-schema.js';
import {
    DuplicateEndpointDefinitionError,
    DuplicateModelDefinitionError,
    EndpointMismatchDefinitionError,
    InvalidIntervalDefinitionError,
    InvalidModelDefinitionError,
    TrackDeletesDefinitionError
} from './utils.js';

import type { CreateActionResponse, CreateFunctionResponse, CreateOnEventResponse, CreateSyncResponse, Requires, TriggerDefinition } from '@nangohq/runner-sdk';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from '@nangohq/runner-sdk/lib/types.js';
import type { FunctionCapabilities, NangoYamlParsed, NangoYamlParsedIntegration, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';
import type * as z from 'zod';

export interface FunctionConfig {
    name: string;
    integrationId: string;
    description: string;
    trigger: TriggerDefinition | null;
    capabilities: FunctionCapabilities;
    input: string | null;
    output: string | null;
    json_schema: JSONSchema7;
}

export interface ParsedIntegrationDefinitions extends NangoYamlParsed {
    functions: FunctionConfig[];
}

const allowed = ['action', 'sync', 'onEvent', 'function'];

export async function parseIntegrationDefinitions({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<ParsedIntegrationDefinitions>> {
    const parsed: ParsedIntegrationDefinitions = { yamlVersion: 'v2', integrations: [], models: new Map(), functions: [] };

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
            // createFunction intentionally omitted from this message while experimental. Add on GA
            return Err(new Error(`Script should be declared using utility function (createSync, createAction, createOnEvent) ${modulePath}`));
        }

        printDebug(`Parsing ${filePath}`, debug);

        const script = moduleContent.default.default as
            | CreateSyncResponse<Record<string, ZodModel>, ZodMetadata, ZodCheckpoint>
            | CreateActionResponse<z.ZodTypeAny, z.ZodTypeAny, ZodMetadata, ZodCheckpoint>
            | CreateOnEventResponse
            | CreateFunctionResponse;

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
                const parsedSyncRes = parseSync({ filePath: realPath, params: script, integrationIdClean, basename, basenameClean });
                if (parsedSyncRes.isErr()) {
                    return Err(parsedSyncRes.error);
                }
                integration.syncs.push(parsedSyncRes.value);
                break;
            }
            case 'action': {
                integration.actions.push(parseAction({ filePath: realPath, params: script, integrationIdClean, basename, basenameClean }));
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
            case 'function': {
                const validationRes = validateFunction({ params: script, integrationId, basename });
                if (validationRes.isErr()) {
                    return Err(validationRes.error);
                }
                if (parsed.functions.some((fn) => fn.integrationId === integrationId && fn.name === basename)) {
                    return Err(
                        new Error(`Function '${integrationId}/functions/${basename}.ts' is already defined. Function names must be unique per integration.`)
                    );
                }
                parsed.functions.push(parseFunction({ params: script, integrationId, integrationIdClean, basename, basenameClean }));
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

export function parseSync({
    filePath,
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    filePath: string;
    params: CreateSyncResponse<Record<string, ZodModel>, ZodMetadata, ZodCheckpoint>;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): Result<ParsedNangoSync> {
    // Validation
    // TODO: We should probably share this with the backend and have a single zod validation
    const interval = getInterval(params.frequency, new Date());
    if (interval instanceof Error) {
        return Err(new InvalidIntervalDefinitionError(filePath, ['createSync', 'frequency']));
    }
    if (params.endpoints && Object.keys(params.models).length !== params.endpoints.length) {
        return Err(new EndpointMismatchDefinitionError(filePath, ['createSync', 'endpoints']));
    }
    if (params.syncType === 'incremental' && params.trackDeletes) {
        return Err(new TrackDeletesDefinitionError(filePath, ['createSync', 'trackDeletes']));
    }

    if (params.endpoints) {
        const seen = new Set();
        for (const endpoint of params.endpoints) {
            const key = `${endpoint.method} ${endpoint.path}`;
            if (seen.has(key)) {
                return Err(new DuplicateEndpointDefinitionError(key, filePath, ['createSync', 'endpoints']));
            }
            seen.add(key);
        }
    }

    for (const modelName of Object.keys(params.models)) {
        if (!regexModelName.test(modelName)) {
            return Err(new InvalidModelDefinitionError(modelName, filePath, ['createSync', 'models']));
        }
    }

    const allZodModels: Record<string, z.ZodType> = { ...params.models };
    const metadataModelName = params.metadata ? `SyncMetadata_${integrationIdClean}_${basenameClean}` : null;
    if (params.metadata && metadataModelName) {
        // Add metadata model
        allZodModels[metadataModelName] = params.metadata;
    }
    const outputNames = Object.keys(params.models);
    const jsonSchema = buildJsonSchemaDefinitionsFromZodModels(allZodModels);

    const features = detectFeatures({ entryPoint: filePath });

    const sync: ParsedNangoSync = {
        type: 'sync',
        description: params.description,
        auto_start: params.autoStart === true,
        endpoints: params.endpoints ?? [],
        input: metadataModelName,
        name: basename,
        output: outputNames,
        runs: params.frequency,
        scopes: params.scopes || [],
        sync_type: params.syncType || 'full',
        track_deletes: params.trackDeletes === true,
        usedModels: Object.keys(allZodModels),
        version: params.version || '',
        webhookSubscriptions: params.webhookSubscriptions || [],
        json_schema: jsonSchema,
        features: features.isOk() ? features.value : [] // silently ignore features detection error as it is only used internally and we don't want it to block the parsing
    };

    return Ok(sync);
}

export function parseAction({
    filePath,
    params,
    integrationIdClean,
    basename,
    basenameClean
}: {
    filePath: string;
    params: CreateActionResponse<z.ZodTypeAny, z.ZodTypeAny, ZodMetadata, ZodCheckpoint>;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): ParsedNangoAction {
    const inputName = `ActionInput_${integrationIdClean}_${basenameClean}`;
    const outputName = `ActionOutput_${integrationIdClean}_${basenameClean}`;

    const allZodModels: Record<string, z.ZodType> = {
        [inputName]: params.input,
        [outputName]: params.output
    };

    const jsonSchema = buildJsonSchemaDefinitionsFromZodModels(allZodModels);

    const features = detectFeatures({ entryPoint: filePath });

    return {
        type: 'action' as const,
        description: params.description,
        endpoint: params.endpoint ?? null,
        input: inputName,
        name: basename,
        output: [outputName],
        scopes: params.scopes || [],
        usedModels: [inputName, outputName],
        version: params.version || '',
        json_schema: jsonSchema,
        features: features.isOk() ? features.value : [] // silently ignore features detection error as it is only used internally and we don't want it to block the parsing
    };
}

export function validateFunction({
    params,
    integrationId,
    basename
}: {
    params: { trigger?: TriggerDefinition | undefined; data?: unknown; requires?: Requires | undefined };
    integrationId: string;
    basename: string;
}): Result<void> {
    const fnPath = `${integrationId}/functions/${basename}.ts`;

    // For now only trigger-less functions (triggered manually) are supported, with no data (records, checkpoints or metadata).
    // TODO: Add support for http, schedule and event triggers, and data
    const supportedFunctionTriggerKinds: TriggerDefinition['kind'][] = [];

    if (params.trigger && !supportedFunctionTriggerKinds.includes(params.trigger.kind)) {
        const supported = supportedFunctionTriggerKinds.map((kind) => `'${kind}'`).join(', ');
        const allowedText = supported ? `${supported} or no trigger` : 'no trigger';
        return Err(new Error(`Function '${fnPath}' uses an unsupported trigger kind '${params.trigger.kind}'. Only ${allowedText} is supported for now.`));
    }
    if (params.data) {
        return Err(new Error(`Function '${fnPath}' declares 'data' (records, checkpoint or metadata) which is not supported yet. Remove 'data' for now.`));
    }
    if (params.requires?.connection === false) {
        return Err(new Error(`Function '${fnPath}' is connection-less (requires.connection = false) which is not supported yet.`));
    }
    if (params.requires?.invoke === true) {
        return Err(new Error(`Function '${fnPath}' declares requires.invoke which is not supported yet.`));
    }

    return Ok(undefined);
}

export function parseFunction({
    params,
    integrationId,
    integrationIdClean,
    basename,
    basenameClean
}: {
    params: CreateFunctionResponse;
    integrationId: string;
    integrationIdClean: string;
    basename: string;
    basenameClean: string;
}): FunctionConfig {
    const inputName = params.input ? `FunctionInput_${integrationIdClean}_${basenameClean}` : null;
    const outputName = params.output ? `FunctionOutput_${integrationIdClean}_${basenameClean}` : null;

    const allZodModels: Record<string, z.ZodType> = {};
    if (inputName) {
        allZodModels[inputName] = params.input as z.ZodType;
    }
    if (outputName) {
        allZodModels[outputName] = params.output as z.ZodType;
    }
    const models = params.data?.models;
    if (models) {
        for (const [name, model] of Object.entries(models)) {
            allZodModels[name] = model as z.ZodType;
        }
    }

    return {
        name: basename,
        integrationId,
        description: params.description,
        trigger: params.trigger ?? null,
        capabilities: deriveFunctionCapabilities(params),
        input: inputName,
        output: outputName,
        json_schema: buildJsonSchemaDefinitionsFromZodModels(allZodModels)
    };
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
