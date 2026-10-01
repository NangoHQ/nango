import type { CatalogTool } from '@nangohq/shared';
import type { DBSyncConfig } from '@nangohq/types';

/** Action-module sibling of `toLegacyConfig`. The runner still requires a sync config. */
export function toRunnableSyncConfig(tool: CatalogTool, { environmentId, configId }: { environmentId: number; configId: number }): DBSyncConfig {
    const now = new Date();
    return {
        id: 0,
        sync_name: tool.name,
        nango_config_id: configId,
        file_location: tool.fileLocation,
        version: tool.version || '0.0.1',
        models: tool.output,
        active: true,
        runs: null,
        model_schema: null,
        environment_id: environmentId,
        track_deletes: false,
        type: 'action',
        auto_start: false,
        attributes: {},
        source: 'catalog',
        metadata: { description: tool.description, scopes: tool.scopes },
        input: tool.input,
        sync_type: null,
        webhook_subscriptions: null,
        enabled: true,
        models_json_schema: tool.jsonSchema,
        sdk_version: tool.sdkVersion,
        features: tool.capabilities.usesCheckpoints ? ['checkpoints'] : [],
        created_at: now,
        updated_at: now,
        deleted: false,
        deleted_at: null
    };
}
