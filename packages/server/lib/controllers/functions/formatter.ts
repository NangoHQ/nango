import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { functionConfigService } from '@nangohq/shared';
import type { FunctionTags, GetFunctionResponse, GetToolResponse } from '@nangohq/types';
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
