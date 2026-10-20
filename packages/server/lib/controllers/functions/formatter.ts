import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { functionConfigService, ResolveRunnableToolResult } from '@nangohq/shared';
import type { FunctionTags, GetFunctionResponse, GetToolResponse, IntegrationConfig, ListedNangoActionFunction } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export function toGetFunctionResponse(fn: functionConfigService.CurrentFunctionConfig): GetFunctionResponse {
    return {
        uuid: fn.config.uuid,
        integration_id: fn.integration.unique_key,
        provider: fn.integration.provider,
        name: fn.config.name,
        description: fn.currentVersion.description,
        tags: fn.currentVersion.tags,
        state: fn.config.enabled ? 'enabled' : 'disabled',
        source: fn.currentVersion.source,
        trigger: fn.currentVersion.trigger,
        input_json_schema: resolveSchemaRef(fn.currentVersion.json_schema, fn.currentVersion.input_schema_ref),
        output_json_schema: resolveSchemaRef(fn.currentVersion.json_schema, fn.currentVersion.output_schema_ref),
        created_at: fn.config.created_at.toISOString(),
        updated_at: fn.config.updated_at.toISOString()
    };
}

export function toGetToolResponse(fn: functionConfigService.CurrentFunctionConfig): GetToolResponse {
    return {
        uuid: fn.config.uuid,
        integration_id: fn.integration.unique_key,
        provider: fn.integration.provider,
        name: fn.config.name,
        description: fn.currentVersion.description,
        input_json_schema: resolveSchemaRef(fn.currentVersion.json_schema, fn.currentVersion.input_schema_ref),
        output_json_schema: resolveSchemaRef(fn.currentVersion.json_schema, fn.currentVersion.output_schema_ref),
        source: fn.currentVersion.source,
        meta: toToolMeta(fn.currentVersion.tags)
    };
}

export function actionToGetToolResponse(
    resolved: Exclude<ResolveRunnableToolResult, { kind: 'missing' }>,
    integration: Pick<IntegrationConfig, 'unique_key' | 'provider'>
): GetToolResponse {
    const action =
        resolved.kind === 'deployed'
            ? {
                  name: resolved.config.sync_name,
                  description: resolved.config.metadata?.description,
                  scopes: resolved.config.metadata?.scopes,
                  input: resolved.config.input,
                  output: resolved.config.models ?? [],
                  jsonSchema: resolved.config.models_json_schema,
                  source: resolved.config.source
              }
            : {
                  name: resolved.tool.name,
                  description: resolved.tool.description,
                  scopes: resolved.tool.scopes,
                  input: resolved.tool.input,
                  output: resolved.tool.output,
                  jsonSchema: resolved.tool.jsonSchema,
                  source: 'tools-catalog' as const
              };
    return listedActionToGetToolResponse(
        {
            name: action.name,
            ...(action.description !== undefined && { description: action.description }),
            ...(action.scopes !== undefined && { scopes: action.scopes }),
            ...(action.input != null && { input: action.input }),
            returns: action.output,
            json_schema: action.jsonSchema,
            source: action.source
        },
        integration
    );
}

export function listedActionToGetToolResponse(
    action: Pick<ListedNangoActionFunction, 'name' | 'description' | 'scopes' | 'input' | 'returns' | 'json_schema' | 'source'>,
    integration: Pick<IntegrationConfig, 'unique_key' | 'provider'>
): GetToolResponse {
    return {
        uuid: null,
        integration_id: integration.unique_key,
        provider: integration.provider,
        name: action.name,
        description: action.description ?? '',
        input_json_schema: resolveActionSchema(action.json_schema, action.input ? [action.input] : []),
        output_json_schema: resolveActionSchema(action.json_schema, action.returns),
        source: action.source,
        meta: { tags: {}, ...(action.scopes?.length && { required_scopes: action.scopes }) }
    };
}

function resolveActionSchema(jsonSchema: JSONSchema7 | null, models: string[]): JSONSchema7 | null {
    if (!jsonSchema || models.length === 0 || models.some((model) => !Object.hasOwn(jsonSchema.definitions ?? {}, model))) {
        return null;
    }
    const filtered = filterJsonSchemaForModels(jsonSchema, models);
    if (filtered.isErr()) {
        return null;
    }
    return {
        ...filtered.value,
        ...(models.length === 1 ? { $ref: `${SCHEMA_REF_PREFIX}${models[0]}` } : { anyOf: models.map((model) => ({ $ref: `${SCHEMA_REF_PREFIX}${model}` })) })
    };
}

function toToolMeta(tags: FunctionTags): GetToolResponse['meta'] {
    const { instructions, required_scopes, ...otherTags } = tags;

    return {
        tags: otherTags,
        ...(typeof instructions === 'string' ? { instructions } : {}),
        ...(Array.isArray(required_scopes) ? { required_scopes } : {})
    };
}

const SCHEMA_REF_PREFIX = '#/definitions/';

function resolveSchemaRef(jsonSchema: JSONSchema7, ref: string | null): JSONSchema7 | null {
    if (!ref || !ref.startsWith(SCHEMA_REF_PREFIX)) {
        return null;
    }

    const model = ref.slice(SCHEMA_REF_PREFIX.length);
    if (!jsonSchema.definitions || !Object.hasOwn(jsonSchema.definitions, model)) {
        return null;
    }

    const definition = jsonSchema.definitions[model];
    if (!definition || typeof definition === 'boolean') {
        return null;
    }

    const filtered = filterJsonSchemaForModels(jsonSchema, [model]);
    if (filtered.isErr()) {
        return null;
    }

    return { ...filtered.value, $ref: ref };
}
