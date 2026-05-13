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
import type { Knex } from 'knex';

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
}

/**
 * Lists active deployed functions for a single integration across syncs,
 * actions, and on-event scripts. Pagination total is returned independently
 * of the page so out-of-range pages still surface the correct total.
 */
export async function listFunctions({
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
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type });

    const [pageRows, countRow] = await Promise.all([
        db.knex
            .from(listing)
            .select<SyncConfigOrOnEventScriptRow[]>('*')
            .orderBy([
                { column: 'type', order: 'asc' },
                { column: 'name', order: 'asc' },
                { column: 'event', order: 'asc' },
                { column: 'id', order: 'asc' }
            ])
            .limit(limit)
            .offset(offset),
        db.knex.from(listing).count<{ total: string }[]>('* as total').first()
    ]);

    const rows = pageRows.flatMap((row) => {
        const fn = toNangoFunctionDeployed(row);
        return fn ? [fn] : [];
    });
    const total = countRow ? Number(countRow.total) : 0;

    return { rows, total };
}

function buildListingSubquery({
    environmentId,
    providerConfigKey,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
}): Knex.Raw {
    const branches: Knex.QueryBuilder[] = [];
    if (type !== 'on-event') {
        branches.push(buildSyncConfigBranch({ environmentId, providerConfigKey, type }));
    }
    if (type === undefined || type === 'on-event') {
        branches.push(buildOnEventBranch({ environmentId, providerConfigKey }));
    }
    return branches.length === 1 ? db.knex.raw('(?) AS listing', [branches[0]]) : db.knex.raw('(? UNION ALL ?) AS listing', branches);
}

function buildSyncConfigBranch({
    environmentId,
    providerConfigKey,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    type: 'sync' | 'action' | undefined;
}): Knex.QueryBuilder {
    // Casts on `source` (sync_config_source enum) and `models_json_schema` (json column)
    // are required for UNION ALL with the on-event branch — Postgres only unions matching types.
    const query = db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true)
        .select(
            'sc.id',
            db.knex.raw('sc.sync_name AS name'),
            'sc.type',
            'sc.metadata',
            'sc.input',
            db.knex.raw('sc.models AS returns'),
            db.knex.raw('CAST(sc.models_json_schema AS jsonb) AS json_schema'),
            'sc.runs',
            'sc.auto_start',
            'sc.track_deletes',
            'sc.enabled',
            db.knex.raw('sc.updated_at AS last_deployed'),
            db.knex.raw('CAST(sc.source AS text) AS source'),
            db.knex.raw('NULL::text AS event')
        );

    if (type) {
        query.andWhere('sc.type', type);
    }

    return query;
}

function buildOnEventBranch({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Knex.QueryBuilder {
    // `oes.event` is a script_trigger_event enum and must be cast to text for UNION ALL.
    return db.knex
        .from({ oes: 'on_event_scripts' })
        .join({ nc: '_nango_configs' }, 'oes.config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('oes.active', true)
        .select(
            'oes.id',
            'oes.name',
            db.knex.raw(`'on-event'::text AS type`),
            db.knex.raw('NULL::jsonb AS metadata'),
            db.knex.raw('NULL::text AS input'),
            db.knex.raw('NULL::text[] AS returns'),
            db.knex.raw('NULL::jsonb AS json_schema'),
            db.knex.raw('NULL::text AS runs'),
            db.knex.raw('NULL::boolean AS auto_start'),
            db.knex.raw('NULL::boolean AS track_deletes'),
            db.knex.raw('oes.active AS enabled'),
            db.knex.raw('oes.updated_at AS last_deployed'),
            db.knex.raw(`'repo'::text AS source`),
            db.knex.raw('CAST(oes.event AS text) AS event')
        );
}

function toNangoFunctionDeployed(row: SyncConfigOrOnEventScriptRow): NangoFunctionDeployed | undefined {
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

    switch (row.type) {
        case 'sync': {
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
        case 'on-event': {
            const apiEvent = row.event ? DB_EVENT_TO_API[row.event] : undefined;
            if (!apiEvent) {
                return undefined;
            }
            const out: NangoOnEventFunctionDeployed = {
                ...base,
                type: 'on-event',
                event: apiEvent,
                ...deployedMeta
            };
            return out;
        }
        case 'action': {
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
        default:
            return undefined;
    }
}
