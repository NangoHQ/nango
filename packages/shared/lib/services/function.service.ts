import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

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
import type { Result } from '@nangohq/utils';
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
    search,
    limit,
    offset
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
}): Promise<{ rows: NangoFunctionDeployed[]; total: number }> {
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search });

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

/*
 * Returns a slim list of active deployed sync/action functions for an integration,
 * intended for cross-referencing the template catalog with what is already deployed.
 *
 * Unlike `listFunctions`, this is unpaginated and excludes on-event scripts —
 * the templates catalog contains only syncs and actions, so callers building a
 * `(name, type) -> deployed` lookup only need those two types.
 */
export async function listDeployedFunctionsMeta({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<{ name: string; type: 'sync' | 'action'; id: number; enabled: boolean; last_deployed: Date; source: FunctionSource }[]> {
    return db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true)
        .select<
            { name: string; type: 'sync' | 'action'; id: number; enabled: boolean; last_deployed: Date; source: FunctionSource }[]
        >('sc.id', db.knex.raw('sc.sync_name AS name'), 'sc.type', 'sc.enabled', db.knex.raw('sc.updated_at AS last_deployed'), 'sc.source');
}

/**
 * Fetches a single deployed function by name within a provider config.
 * If `type` is omitted and multiple types share the same name, the first
 * match by the listing's stable order is returned.
 */
export async function getFunction({
    environmentId,
    providerConfigKey,
    name,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    name: string;
    type: FunctionType | undefined;
}): Promise<Result<NangoFunctionDeployed | undefined>> {
    try {
        const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search: undefined });

        const row = await db.knex
            .from(listing)
            .select<SyncConfigOrOnEventScriptRow[]>('*')
            .where('name', name)
            .orderBy([
                { column: 'type', order: 'asc' },
                { column: 'name', order: 'asc' },
                { column: 'event', order: 'asc' },
                { column: 'id', order: 'asc' }
            ])
            .first();

        return Ok(row ? toNangoFunctionDeployed(row) : undefined);
    } catch (err) {
        return Err(new Error('failed_to_get_function', { cause: err }));
    }
}

function buildListingSubquery({
    environmentId,
    providerConfigKey,
    type,
    search
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
}): Knex.Raw {
    const branches: Knex.QueryBuilder[] = [];
    if (type !== 'on-event') {
        branches.push(buildSyncConfigBranch({ environmentId, providerConfigKey, type, search }));
    }
    if (type === undefined || type === 'on-event') {
        branches.push(buildOnEventBranch({ environmentId, providerConfigKey, search }));
    }
    return branches.length === 1 ? db.knex.raw('(?) AS listing', [branches[0]]) : db.knex.raw('(? UNION ALL ?) AS listing', branches);
}

function buildSyncConfigBranch({
    environmentId,
    providerConfigKey,
    type,
    search
}: {
    environmentId: number;
    providerConfigKey: string;
    type: 'sync' | 'action' | undefined;
    search: string | undefined;
}): Knex.QueryBuilder {
    // Cast on `source` (sync_config_source enum) is required for UNION ALL with the on-event branch —
    // Postgres only unions matching types.
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
            db.knex.raw('sc.models_json_schema AS json_schema'),
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

    if (search) {
        query.andWhereILike('sc.sync_name', `%${escapeLikePattern(search)}%`);
    }

    return query;
}

function buildOnEventBranch({
    environmentId,
    providerConfigKey,
    search
}: {
    environmentId: number;
    providerConfigKey: string;
    search: string | undefined;
}): Knex.QueryBuilder {
    // `oes.event` is a script_trigger_event enum and must be cast to text for UNION ALL.
    const query = db.knex
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
            db.knex.raw('NULL::json AS json_schema'),
            db.knex.raw('NULL::text AS runs'),
            db.knex.raw('NULL::boolean AS auto_start'),
            db.knex.raw('NULL::boolean AS track_deletes'),
            db.knex.raw('oes.active AS enabled'),
            db.knex.raw('oes.updated_at AS last_deployed'),
            db.knex.raw(`'repo'::text AS source`),
            db.knex.raw('CAST(oes.event AS text) AS event')
        );

    if (search) {
        query.andWhereILike('oes.name', `%${escapeLikePattern(search)}%`);
    }

    return query;
}

// Escapes the LIKE wildcard meta-characters so user input is matched literally.
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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
