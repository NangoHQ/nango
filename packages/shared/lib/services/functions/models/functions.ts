import db from '@nangohq/database';

import type { FunctionSource, FunctionType, NangoConfigMetadata } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';
import type { Knex } from 'knex';

export interface FunctionRow {
    id: number;
    name: string;
    type: string;
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

export interface DeployedFunctionMetaRow {
    id: number;
    name: string;
    type: 'sync' | 'action';
    enabled: boolean;
    last_deployed: Date;
    source: FunctionSource;
}

export async function findActiveByEnvironment({
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
}): Promise<{ rows: FunctionRow[]; total: number }> {
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search });

    const [pageRows, countRow] = await Promise.all([
        db.knex
            .from(listing)
            .select<FunctionRow[]>('*')
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

    const total = countRow ? Number(countRow.total) : 0;
    return { rows: pageRows, total };
}

/**
 * Returns a slim list of active deployed sync/action functions for an integration,
 * intended for cross-referencing the template catalog with what is already deployed.
 *
 * Unpaginated and excludes on-event scripts — the templates catalog contains only
 * syncs and actions, so callers building a `(name, type) -> deployed` lookup only
 * need those two types.
 */
export async function findActiveDeployedMeta({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<DeployedFunctionMetaRow[]> {
    return db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true)
        .select<
            DeployedFunctionMetaRow[]
        >('sc.id', db.knex.raw('sc.sync_name AS name'), 'sc.type', 'sc.enabled', db.knex.raw('sc.updated_at AS last_deployed'), 'sc.source');
}

export async function findActiveByName({
    environmentId,
    providerConfigKey,
    name,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    name: string;
    type: FunctionType | undefined;
}): Promise<FunctionRow | undefined> {
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search: undefined });

    const row = await db.knex
        .from(listing)
        .select<FunctionRow[]>('*')
        .where('name', name)
        .orderBy([
            { column: 'type', order: 'asc' },
            { column: 'name', order: 'asc' },
            { column: 'event', order: 'asc' },
            { column: 'id', order: 'asc' }
        ])
        .first();

    return row;
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

function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
