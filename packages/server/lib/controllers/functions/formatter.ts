import { resolveSchemaRef } from '@nangohq/utils';

import type { functionConfigService } from '@nangohq/shared';
import type { GetFunctionResponse } from '@nangohq/types';

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
