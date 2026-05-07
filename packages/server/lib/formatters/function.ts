import type { NangoFunction, NangoFunctionDeployed, NangoOnEventFunctionDeployed, NangoSyncConfig, OnEventScript } from '@nangohq/types';

export function toNangoFunction(config: NangoSyncConfig): NangoFunction {
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

    if (config.type === 'on-event') {
        // On-event scripts go through toNangoFunctionDeployedFromOnEvent; their NangoSyncConfig form
        // doesn't carry the OnEventType discriminator we need, so this path shouldn't be reached.
        throw new Error(`toNangoFunction does not support on-event configs; use toNangoFunctionDeployedFromOnEvent`);
    }

    return {
        ...base,
        type: 'action',
        ...(config.input !== undefined && { input: config.input }),
        returns: config.returns,
        json_schema: config.json_schema
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

// On-event scripts live in their own table and lack the rich metadata that sync/action configs carry.
// Default the missing fields and stamp source: 'repo' since on-events only ship via `nango deploy`.
export function toNangoFunctionDeployedFromOnEvent(script: OnEventScript): NangoOnEventFunctionDeployed {
    return {
        name: script.name,
        type: 'on-event',
        event: script.event,
        id: script.id,
        enabled: script.active,
        last_deployed: script.updatedAt.toISOString(),
        source: 'repo'
    };
}
