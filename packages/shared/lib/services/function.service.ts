import db from '@nangohq/database';

import type {
    FunctionSource,
    FunctionType,
    NangoActionFunctionDeployed,
    NangoConfigMetadata,
    NangoFunctionDeployed,
    NangoOnEventFunctionDeployed,
    NangoSyncFunctionDeployed,
    OnEventType
} from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const DB_EVENT_TO_API: Record<string, OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion',
    VALIDATE_CONNECTION: 'validate-connection'
};

interface SyncConfigOrOnEventScriptRow {
    id: number;
    name: string;
    type: 'sync' | 'action' | 'on-event';
    metadata: NangoConfigMetadata | null;
    input: string | null;
    returns: string[] | null;
    json_schema: JSONSchema7 | null;
    runs: string | null;
    auto_start: boolean | null;
    track_deletes: boolean | null;
    enabled: boolean;
    last_deployed: Date;
    source: FunctionSource;
    event: string | null;
    total: string;
}

/**
 * Lists active deployed functions for a single integration across syncs,
 * actions, and on-event scripts.
 *
 * The query merges `_nango_sync_configs` and `on_event_scripts` into one
 * result set, applies the optional type filter, and returns both the current
 * page and the total number of matching functions in a single roundtrip via
 * `COUNT(*) OVER ()`.
 *
 * Results are ordered by `(type, name, event, id)` so offset pagination stays
 * deterministic even when multiple on-event functions share the same name.
 */
export async function listIntegrationFunctions({
    environmentId,
    providerConfigKey,
    type,
    limit,
    offset
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    limit: number;
    offset: number;
}): Promise<{ rows: NangoFunctionDeployed[]; total: number }> {
    const typeBinding = type ?? null;
    const result = await db.knex.raw<{ rows: SyncConfigOrOnEventScriptRow[] }>(
        `
        SELECT id, name, type, metadata, input, returns, json_schema,
               runs, auto_start, track_deletes, enabled, last_deployed, source, event,
               COUNT(*) OVER () AS total
        FROM (
            SELECT
                sc.id,
                sc.sync_name AS name,
                CAST(sc.type AS text) AS type,
                sc.metadata,
                sc.input,
                sc.models AS returns,
                CAST(sc.models_json_schema AS jsonb) AS json_schema,
                sc.runs,
                sc.auto_start,
                sc.track_deletes,
                sc.enabled,
                sc.updated_at AS last_deployed,
                CAST(sc.source AS text) AS source,
                CAST(NULL AS text) AS event
            FROM _nango_sync_configs sc
            JOIN _nango_configs nc ON sc.nango_config_id = nc.id
            WHERE nc.environment_id = ?
              AND nc.unique_key = ?
              AND nc.deleted = false
              AND sc.deleted = false
              AND sc.active = true
              AND (CAST(? AS text) IS NULL OR CAST(sc.type AS text) = CAST(? AS text))

            UNION ALL

            SELECT
                oes.id,
                oes.name,
                'on-event' AS type,
                CAST(NULL AS jsonb) AS metadata,
                CAST(NULL AS text) AS input,
                CAST(NULL AS text[]) AS returns,
                CAST(NULL AS jsonb) AS json_schema,
                CAST(NULL AS text) AS runs,
                CAST(NULL AS boolean) AS auto_start,
                CAST(NULL AS boolean) AS track_deletes,
                oes.active AS enabled,
                oes.updated_at AS last_deployed,
                'repo' AS source,
                CAST(oes.event AS text) AS event
            FROM on_event_scripts oes
            JOIN _nango_configs nc ON oes.config_id = nc.id
            WHERE nc.environment_id = ?
              AND nc.unique_key = ?
              AND nc.deleted = false
              AND oes.active = true
              AND (CAST(? AS text) IS NULL OR CAST(? AS text) = 'on-event')
        ) listing
        ORDER BY type ASC, name ASC, event ASC, id ASC
        LIMIT ? OFFSET ?
        `,
        [environmentId, providerConfigKey, typeBinding, typeBinding, environmentId, providerConfigKey, typeBinding, typeBinding, limit, offset]
    );

    const rows = result.rows.map(fromSyncConfigOrOnEventRowToNangoFunctionDeployed);
    const total = result.rows[0] ? Number(result.rows[0].total) : 0;

    return { rows, total };
}

function fromSyncConfigOrOnEventRowToNangoFunctionDeployed(row: SyncConfigOrOnEventScriptRow): NangoFunctionDeployed {
    const description = row.metadata?.description;
    const scopes = row.metadata?.scopes;
    const base = {
        name: row.name,
        ...(description !== undefined && { description }),
        ...(scopes !== undefined && { scopes })
    };
    const deployedMeta = {
        id: row.id,
        enabled: row.enabled,
        last_deployed: row.last_deployed.toISOString(),
        source: row.source
    };

    if (row.type === 'sync') {
        const out: NangoSyncFunctionDeployed = {
            ...base,
            type: 'sync',
            ...(row.input !== null && { input: row.input }),
            returns: row.returns ?? [],
            json_schema: row.json_schema,
            runs: row.runs,
            auto_start: row.auto_start ?? false,
            track_deletes: row.track_deletes ?? false,
            ...deployedMeta
        };
        return out;
    }

    if (row.type === 'on-event') {
        const apiEvent = row.event ? DB_EVENT_TO_API[row.event] : undefined;
        if (!apiEvent) {
            throw new Error(`Unknown on-event type for function id=${row.id}: ${row.event}`);
        }
        const out: NangoOnEventFunctionDeployed = {
            ...base,
            type: 'on-event',
            event: apiEvent,
            ...deployedMeta
        };
        return out;
    }

    const out: NangoActionFunctionDeployed = {
        ...base,
        type: 'action',
        ...(row.input !== null && { input: row.input }),
        returns: row.returns ?? [],
        json_schema: row.json_schema,
        ...deployedMeta
    };
    return out;
}
