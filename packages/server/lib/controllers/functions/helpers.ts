import { baseUrl } from '@nangohq/utils';

import type { functionConfigService } from '@nangohq/shared';
import type { GetFunctionResponse } from '@nangohq/types';

export function getFunctionCallbackBaseUrl(): string {
    return baseUrl;
}

export function toGetFunctionResponse(fn: functionConfigService.CurrentFunctionConfig): GetFunctionResponse {
    return {
        uuid: fn.config.uuid,
        integration_id: fn.integration.unique_key,
        provider: fn.integration.provider,
        name: fn.config.name,
        description: fn.currentVersion.description,
        state: fn.config.enabled ? 'enabled' : 'disabled',
        source: fn.currentVersion.source,
        trigger: fn.currentVersion.trigger,
        created_at: fn.config.created_at.toISOString(),
        updated_at: fn.config.updated_at.toISOString()
    };
}
