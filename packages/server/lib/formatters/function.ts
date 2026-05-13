import type { NangoActionFunction, NangoSyncConfig, NangoSyncFunction } from '@nangohq/types';

export function toNangoFunction(config: NangoSyncConfig): NangoSyncFunction | NangoActionFunction | undefined {
    const description = config.description ?? config.metadata?.description;
    const scopes = config.scopes ?? config.metadata?.scopes;
    const base = {
        name: config.name,
        ...(description !== undefined && { description }),
        ...(scopes !== undefined && { scopes })
    };

    if (config.type === 'sync') {
        return {
            ...base,
            type: 'sync',
            ...(config.input !== undefined && { input: config.input }),
            returns: config.returns,
            json_schema: config.json_schema,
            runs: config.runs ?? null,
            auto_start: config.auto_start ?? false,
            track_deletes: config.track_deletes ?? false
        };
    }

    if (config.type === 'action' || config.type === undefined) {
        return {
            ...base,
            type: 'action',
            ...(config.input !== undefined && { input: config.input }),
            returns: config.returns,
            json_schema: config.json_schema
        };
    }

    return undefined;
}
