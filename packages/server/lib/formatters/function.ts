import type { NangoFunction, NangoFunctionDeployed, NangoSyncConfig } from '@nangohq/types';

export function toNangoFunction(config: NangoSyncConfig): NangoFunction {
    const isSync = config.type === 'sync';
    const description = config.description ?? config.metadata?.description;
    const scopes = config.scopes ?? config.metadata?.scopes;
    return {
        name: config.name,
        type: isSync ? 'sync' : 'action',
        ...(description !== undefined && { description }),
        ...(scopes !== undefined && { scopes }),
        ...(config.input !== undefined && { input: config.input }),
        returns: config.returns,
        json_schema: config.json_schema,
        ...(isSync && {
            runs: config.runs ?? null,
            auto_start: config.auto_start ?? false,
            track_deletes: config.track_deletes ?? false
        })
    };
}

// Deployed configs always carry id, last_deployed, and source from the DB.
export function toNangoFunctionDeployed(config: NangoSyncConfig): NangoFunctionDeployed {
    return {
        ...toNangoFunction(config),
        id: config.id!,
        enabled: config.enabled ?? false,
        last_deployed: config.last_deployed!,
        source: config.source!
    };
}
