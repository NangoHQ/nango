import db from '@nangohq/database';

import { getCatalogAction, listCatalogActions } from '../../../catalog/actions.js';
import { isCatalogActionEnabled } from '../../../catalog/membership.js';

import type { CatalogAction } from '../../../catalog/actions.js';
import type { FunctionListSource, FunctionSource, FunctionType, NangoConfigMetadata } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';
import type { Knex } from 'knex';

export interface FunctionRow {
    id: number | null;
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
    last_deployed: Date | null;
    source: FunctionListSource;
    event: string | null;
}

export interface FunctionAvailabilityRow {
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
    offset,
    catalog = []
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
    catalog?: CatalogAction[];
}): Promise<{ rows: FunctionRow[]; total: number }> {
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search, catalog });

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
 * Returns a slim list of active sync/action function availability for an integration,
 * intended for cross-referencing the template catalog with what is already listed.
 *
 * Unpaginated and excludes on-event scripts — the templates catalog contains only
 * syncs and actions, so callers building a `(name, type) -> availability` lookup only
 * need those two types.
 */
export async function findActiveFunctionAvailability({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<FunctionAvailabilityRow[]> {
    return activeSyncConfigBase({ environmentId, providerConfigKey }).select<FunctionAvailabilityRow[]>(
        'sc.id',
        'sc.sync_name AS name',
        'sc.type',
        'sc.enabled',
        'sc.created_at AS last_deployed',
        'sc.source'
    );
}

export interface IntegrationFunctionCatalogRow {
    integration_id: string;
    provider: string;
    name: string | null;
    type: 'sync' | 'action' | null;
    description: string | null;
    enabled: boolean | null;
}

/**
 * Returns every integration in the environment alongside its active sync and action
 * functions, one row per function and a single row with null function columns for an
 * integration that has none.
 *
 * Built for compiling an agent session toolset, which has to tell "this integration does
 * not exist" apart from "it exists and has no tools", and has to see syncs so that naming
 * one is rejected as the wrong function type rather than as an unknown tool.
 */
export async function findIntegrationFunctionCatalog({
    environmentId,
    providerConfigKeys
}: {
    environmentId: number;
    providerConfigKeys?: string[] | undefined;
}): Promise<IntegrationFunctionCatalogRow[]> {
    const query = db.knex
        .from({ nc: '_nango_configs' })
        .leftJoin({ sc: '_nango_sync_configs' }, function () {
            this.on('sc.nango_config_id', 'nc.id')
                .andOnVal('sc.environment_id', environmentId)
                .andOnVal('sc.deleted', false)
                .andOnVal('sc.active', true)
                .andOnIn('sc.type', ['sync', 'action']);
        })
        .where('nc.environment_id', environmentId)
        .andWhere('nc.deleted', false)
        .select<CatalogQueryRow[]>(
            'nc.unique_key AS integration_id',
            'nc.provider',
            'sc.sync_name AS name',
            'sc.type',
            db.knex.raw("sc.metadata->>'description' AS description"),
            'sc.enabled',
            'nc.auto_enable_catalog_actions',
            'nc.catalog_action_overrides'
        )
        .orderBy([
            { column: 'nc.unique_key', order: 'asc' },
            { column: 'sc.sync_name', order: 'asc' }
        ]);

    if (providerConfigKeys) {
        query.whereIn('nc.unique_key', providerConfigKeys);
    }

    return mergeLiveCatalogIntoFunctionCatalog(await query);
}

interface CatalogQueryRow extends IntegrationFunctionCatalogRow {
    auto_enable_catalog_actions: boolean;
    catalog_action_overrides: Record<string, boolean> | null;
}

function mergeLiveCatalogIntoFunctionCatalog(rows: CatalogQueryRow[]): IntegrationFunctionCatalogRow[] {
    const byIntegration = new Map<string, CatalogQueryRow[]>();
    for (const row of rows) {
        const group = byIntegration.get(row.integration_id) ?? [];
        group.push(row);
        byIntegration.set(row.integration_id, group);
    }

    const merged: IntegrationFunctionCatalogRow[] = [];
    for (const group of byIntegration.values()) {
        const sample = group[0];
        if (!sample) {
            continue;
        }

        const deployedActionNames = new Set(group.filter((row) => row.type === 'action' && row.name).map((row) => row.name as string));
        const deployed = group.filter((row) => row.name !== null).map(toCatalogRow);
        const live = listCatalogActions(sample.provider)
            .filter((action) => !deployedActionNames.has(action.name))
            .map((action) => ({
                integration_id: sample.integration_id,
                provider: sample.provider,
                name: action.name,
                type: 'action' as const,
                description: action.description,
                enabled: isCatalogActionEnabled({
                    name: action.name,
                    autoEnable: sample.auto_enable_catalog_actions,
                    overrides: sample.catalog_action_overrides ?? {}
                })
            }));

        const functions = [...deployed, ...live];
        if (functions.length === 0) {
            merged.push({
                integration_id: sample.integration_id,
                provider: sample.provider,
                name: null,
                type: null,
                description: null,
                enabled: null
            });
        } else {
            merged.push(...functions);
        }
    }

    merged.sort((a, b) => {
        const integration = a.integration_id.localeCompare(b.integration_id);
        if (integration !== 0) {
            return integration;
        }
        return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return merged;
}

function toCatalogRow(row: CatalogQueryRow): IntegrationFunctionCatalogRow {
    return {
        integration_id: row.integration_id,
        provider: row.provider,
        name: row.name,
        type: row.type,
        description: row.description,
        enabled: row.enabled
    };
}

export interface ActionInputSchemaRow {
    integration_id: string;
    name: string;
    input: string | null;
    models_json_schema: { definitions?: Record<string, JSONSchema7> } | null;
}

/**
 * Returns the input model name and the deployed schema definitions for named actions, across
 * as many integrations as the caller asks for in one query.
 *
 * Only actions that are still active and enabled come back, so a stale name resolves to nothing
 * rather than to a schema that cannot be run.
 */
export async function findActionInputSchemas({
    environmentId,
    actions
}: {
    environmentId: number;
    actions: { integrationId: string; name: string }[];
}): Promise<ActionInputSchemaRow[]> {
    if (actions.length === 0) {
        return [];
    }

    const deployed = await db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.deleted', false)
        .andWhere('sc.environment_id', environmentId)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true)
        .andWhere('sc.enabled', true)
        .andWhere('sc.type', 'action')
        .whereIn(
            ['nc.unique_key', 'sc.sync_name'],
            actions.map((action) => [action.integrationId, action.name])
        )
        .select<ActionInputSchemaRow[]>('nc.unique_key AS integration_id', 'sc.sync_name AS name', 'sc.input', 'sc.models_json_schema');

    const found = new Set(deployed.map((row) => `${row.integration_id}:${row.name}`));
    const missing = actions.filter((action) => !found.has(`${action.integrationId}:${action.name}`));
    if (missing.length === 0) {
        return deployed;
    }

    const integrationIds = [...new Set(missing.map((action) => action.integrationId))];
    const configs = await db.knex
        .from('_nango_configs')
        .where('environment_id', environmentId)
        .andWhere('deleted', false)
        .whereIn('unique_key', integrationIds)
        .select<
            { unique_key: string; provider: string; auto_enable_catalog_actions: boolean; catalog_action_overrides: Record<string, boolean> | null }[]
        >('unique_key', 'provider', 'auto_enable_catalog_actions', 'catalog_action_overrides');

    const configByKey = new Map(configs.map((config) => [config.unique_key, config]));
    const live: ActionInputSchemaRow[] = [];
    for (const action of missing) {
        const config = configByKey.get(action.integrationId);
        if (!config) {
            continue;
        }
        const catalog = getCatalogAction(config.provider, action.name);
        if (
            !catalog ||
            !isCatalogActionEnabled({
                name: action.name,
                autoEnable: config.auto_enable_catalog_actions,
                overrides: config.catalog_action_overrides ?? {}
            })
        ) {
            continue;
        }
        live.push({
            integration_id: action.integrationId,
            name: action.name,
            input: catalog.input,
            models_json_schema: catalog.json_schema as ActionInputSchemaRow['models_json_schema']
        });
    }

    return [...deployed, ...live];
}

function activeSyncConfigBase({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Knex.QueryBuilder {
    return db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true);
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
    search,
    catalog = []
}: {
    environmentId: number;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    catalog?: CatalogAction[];
}): Knex.Raw {
    const branches: Knex.QueryBuilder[] = [];
    if (type !== 'on-event') {
        branches.push(buildSyncConfigBranch({ environmentId, providerConfigKey, type, search }));
    }
    if (type === undefined || type === 'on-event') {
        branches.push(buildOnEventBranch({ environmentId, providerConfigKey, search }));
    }
    if (catalog.length > 0 && type !== 'sync' && type !== 'on-event') {
        branches.push(buildCatalogBranch({ environmentId, providerConfigKey, catalog, search }));
    }
    const union = branches.map(() => '?').join(' UNION ALL ');
    return db.knex.raw(`(${union}) AS listing`, branches);
}

function buildCatalogBranch({
    environmentId,
    providerConfigKey,
    catalog,
    search
}: {
    environmentId: number;
    providerConfigKey: string;
    catalog: CatalogAction[];
    search: string | undefined;
}): Knex.QueryBuilder {
    const catalogRows = db.knex.raw(
        `jsonb_to_recordset(?::jsonb) AS c(name text, description text, scopes jsonb, input text, output text[], json_schema json)`,
        [JSON.stringify(catalog)]
    );

    const query = db.knex
        .from({ nc: '_nango_configs' })
        .crossJoin(catalogRows)
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .whereNotExists(
            activeSyncConfigBase({ environmentId, providerConfigKey }).andWhere('sc.type', 'action').whereRaw('sc.sync_name = c.name').select(db.knex.raw('1'))
        );

    if (search) {
        const pattern = `%${escapeLikePattern(search)}%`;
        query.andWhere(function () {
            this.whereRaw('c.name ILIKE ?', [pattern]).orWhereRaw('c.description ILIKE ?', [pattern]);
        });
    }

    return query.select(
        db.knex.raw('NULL::int AS id'),
        'c.name',
        db.knex.raw(`'action'::text AS type`),
        db.knex.raw(`
            jsonb_build_object('description', c.description)
            || CASE WHEN jsonb_array_length(c.scopes) > 0 THEN jsonb_build_object('scopes', c.scopes) ELSE '{}'::jsonb END
            AS metadata
        `),
        'c.input',
        db.knex.raw('c.output AS returns'),
        'c.json_schema',
        db.knex.raw('NULL::text AS runs'),
        db.knex.raw('NULL::boolean AS auto_start'),
        db.knex.raw('NULL::boolean AS track_deletes'),
        db.knex.raw(`
            CASE
                WHEN jsonb_exists(nc.catalog_action_overrides, c.name)
                THEN (nc.catalog_action_overrides ->> c.name)::boolean
                ELSE nc.auto_enable_catalog_actions
            END AS enabled
        `),
        db.knex.raw('NULL::timestamptz AS last_deployed'),
        db.knex.raw(`'nango-catalog'::text AS source`),
        db.knex.raw('NULL::text AS event')
    );
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
    const query = activeSyncConfigBase({ environmentId, providerConfigKey }).select(
        'sc.id',
        'sc.sync_name AS name',
        'sc.type',
        'sc.metadata',
        'sc.input',
        'sc.models AS returns',
        'sc.models_json_schema AS json_schema',
        'sc.runs',
        'sc.auto_start',
        'sc.track_deletes',
        'sc.enabled',
        'sc.created_at AS last_deployed',
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
            db.knex.raw('oes.created_at AS last_deployed'),
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
