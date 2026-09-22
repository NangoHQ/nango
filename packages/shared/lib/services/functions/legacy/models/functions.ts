import db from '@nangohq/database';
import { flags } from '@nangohq/utils';

import { getCatalogAction, listCatalogActions } from '../../../catalog/actions.js';

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

const listingOrderBy = [
    { column: 'type', order: 'asc' as const },
    { column: 'name', order: 'asc' as const },
    { column: 'event', order: 'asc' as const },
    { column: 'id', order: 'asc' as const }
];

type ListingPageRow = FunctionRow & { total: string | number };

function catalogActions(provider: string | undefined, type: FunctionType | undefined): CatalogAction[] {
    if (!provider || !flags.hasLiveCatalogActions || (type !== undefined && type !== 'action')) {
        return [];
    }
    return listCatalogActions(provider);
}

async function providerForConfig(environmentId: number, providerConfigKey: string): Promise<string | undefined> {
    const row = await db.knex
        .from('_nango_configs')
        .where({ environment_id: environmentId, unique_key: providerConfigKey, deleted: false })
        .select<{ provider: string }>('provider')
        .first();
    return row?.provider;
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
    const catalog = catalogActions(await providerForConfig(environmentId, providerConfigKey), type);
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search, catalog });
    const pageRows = await db.knex
        .from(listing)
        .select<ListingPageRow[]>('*', db.knex.raw('COUNT(*) OVER() AS total'))
        .orderBy(listingOrderBy)
        .limit(limit)
        .offset(offset);

    let total = pageRows.length > 0 ? Number(pageRows[0]!.total) : 0;
    // COUNT(*) OVER() is computed before LIMIT, but an empty page has no row to read it from.
    if (pageRows.length === 0 && offset > 0) {
        const countRow = await db.knex.from(listing).count<{ total: string }[]>('* as total').first();
        total = countRow ? Number(countRow.total) : 0;
    }

    const rows = pageRows.map(({ total: _total, ...row }) => row);
    hydrateCatalogJsonSchemas(rows, catalog);
    return { rows, total };
}

export async function findActiveActions({
    environmentId,
    providerConfigKey,
    limit
}: {
    environmentId: number;
    providerConfigKey: string;
    limit: number;
}): Promise<FunctionRow[]> {
    const catalog = catalogActions(await providerForConfig(environmentId, providerConfigKey), 'action');
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type: 'action', search: undefined, catalog });
    const rows = await db.knex.from(listing).select<FunctionRow[]>('*').orderBy(listingOrderBy).limit(limit);
    hydrateCatalogJsonSchemas(rows, catalog);
    return rows;
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

export interface IntegrationFunctionRow {
    integration_id: string;
    provider: string;
    name: string | null;
    type: 'sync' | 'action' | null;
    description: string | null;
    enabled: boolean | null;
}

/**
 * Returns every integration in the environment alongside its available sync and action
 * functions (deployed rows plus catalog actions), one row per function and a single
 * row with null function columns for an integration that has none.
 *
 * Built for compiling an agent session toolset, which has to tell "this integration does
 * not exist" apart from "it exists and has no tools", and has to see syncs so that naming
 * one is rejected as the wrong function type rather than as an unknown tool.
 */
export async function findIntegrationFunctions({
    environmentId,
    providerConfigKeys
}: {
    environmentId: number;
    providerConfigKeys?: string[] | undefined;
}): Promise<IntegrationFunctionRow[]> {
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
        .select<DeployedFunctionRow[]>(
            'nc.unique_key AS integration_id',
            'nc.provider',
            'sc.sync_name AS name',
            'sc.type',
            db.knex.raw("sc.metadata->>'description' AS description"),
            'sc.enabled'
        )
        .orderBy([
            { column: 'nc.unique_key', order: 'asc' },
            { column: 'sc.sync_name', order: 'asc' }
        ]);

    if (providerConfigKeys) {
        query.whereIn('nc.unique_key', providerConfigKeys);
    }

    return appendCatalogActions(await query);
}

type DeployedFunctionRow = IntegrationFunctionRow;

function appendCatalogActions(deployedRows: DeployedFunctionRow[]): IntegrationFunctionRow[] {
    if (!flags.hasLiveCatalogActions) {
        return deployedRows.map(toFunctionRow);
    }

    const byIntegration = new Map<string, DeployedFunctionRow[]>();
    for (const row of deployedRows) {
        const group = byIntegration.get(row.integration_id) ?? [];
        group.push(row);
        byIntegration.set(row.integration_id, group);
    }

    const merged: IntegrationFunctionRow[] = [];
    for (const group of byIntegration.values()) {
        const sample = group[0];
        if (!sample) {
            continue;
        }

        const deployedActionNames = new Set(group.filter((row) => row.type === 'action' && row.name).map((row) => row.name as string));
        const deployed = group.filter((row) => row.name !== null).map(toFunctionRow);
        const catalog = listCatalogActions(sample.provider)
            .filter((action) => !deployedActionNames.has(action.name))
            .map((action) => ({
                integration_id: sample.integration_id,
                provider: sample.provider,
                name: action.name,
                type: 'action' as const,
                description: action.description,
                enabled: true
            }));

        const functions = [...deployed, ...catalog];
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

function toFunctionRow(row: DeployedFunctionRow): IntegrationFunctionRow {
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
 * Returns the input model name and schema definitions for named actions, across as many
 * integrations as the caller asks for in one query.
 *
 * An active deployed action occupies the name even when it is disabled: the catalog is
 * not used as a fallback, and a disabled deployed row contributes no schema. Catalog schemas
 * are returned only for unoccupied names.
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

    const activeRows = await db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.deleted', false)
        .andWhere('sc.environment_id', environmentId)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true)
        .andWhere('sc.type', 'action')
        .whereIn(
            ['nc.unique_key', 'sc.sync_name'],
            actions.map((action) => [action.integrationId, action.name])
        )
        .select<(ActionInputSchemaRow & { enabled: boolean })[]>(
            'nc.unique_key AS integration_id',
            'sc.sync_name AS name',
            'sc.input',
            'sc.models_json_schema',
            'sc.enabled'
        );

    const occupied = new Set(activeRows.map((row) => `${row.integration_id}:${row.name}`));
    const deployed: ActionInputSchemaRow[] = [];
    for (const row of activeRows) {
        if (!row.enabled) {
            continue;
        }
        deployed.push({
            integration_id: row.integration_id,
            name: row.name,
            input: row.input,
            models_json_schema: row.models_json_schema
        });
    }

    const missing = actions.filter((action) => !occupied.has(`${action.integrationId}:${action.name}`));
    if (!flags.hasLiveCatalogActions || missing.length === 0) {
        return deployed;
    }

    const integrationIds = [...new Set(missing.map((action) => action.integrationId))];
    const configs = await db.knex
        .from('_nango_configs')
        .where('environment_id', environmentId)
        .andWhere('deleted', false)
        .whereIn('unique_key', integrationIds)
        .select<{ unique_key: string; provider: string }[]>('unique_key', 'provider');

    const configByKey = new Map(configs.map((config) => [config.unique_key, config]));
    const catalogRows: ActionInputSchemaRow[] = [];
    for (const action of missing) {
        const config = configByKey.get(action.integrationId);
        if (!config) {
            continue;
        }
        const catalog = getCatalogAction(config.provider, action.name);
        if (!catalog) {
            continue;
        }
        catalogRows.push({
            integration_id: action.integrationId,
            name: action.name,
            input: catalog.input,
            models_json_schema: catalog.json_schema as ActionInputSchemaRow['models_json_schema']
        });
    }

    return [...deployed, ...catalogRows];
}

function activeSyncConfigBase({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Knex.QueryBuilder {
    return db.knex
        .from({ sc: '_nango_sync_configs' })
        .join({ nc: '_nango_configs' }, 'sc.nango_config_id', 'nc.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .andWhere('sc.environment_id', environmentId)
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
    const catalog = catalogActions(await providerForConfig(environmentId, providerConfigKey), type);
    const listing = buildListingSubquery({ environmentId, providerConfigKey, type, search: undefined, catalog });

    const row = await db.knex.from(listing).select<FunctionRow[]>('*').where('name', name).orderBy(listingOrderBy).first();
    if (row) {
        hydrateCatalogJsonSchemas([row], catalog);
    }
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

/**
 * Strip away the extra fields from the catalog action object that are not needed for the listing.
 * Mainly json_schema which can be large.
 */
function toCatalogListingBind(catalog: CatalogAction[]): Pick<CatalogAction, 'name' | 'description' | 'scopes' | 'input' | 'output'>[] {
    return catalog.map((action) => ({
        name: action.name,
        description: action.description,
        scopes: action.scopes,
        input: action.input,
        output: action.output
    }));
}

/**
 * Used to re-hydrate the json_schema field into the FunctionRow object.
 */
function hydrateCatalogJsonSchemas(rows: FunctionRow[], catalog: CatalogAction[]): void {
    if (catalog.length === 0) {
        return;
    }

    const schemaByName = new Map(catalog.map((action) => [action.name, action.json_schema]));
    for (const row of rows) {
        if (row.source !== 'live-catalog') {
            continue;
        }
        row.json_schema = schemaByName.get(row.name) ?? null;
    }
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
    const catalogRows = db.knex.raw(`jsonb_to_recordset(?::jsonb) AS c(name text, description text, scopes jsonb, input text, output text[])`, [
        JSON.stringify(toCatalogListingBind(catalog))
    ]);

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
        query.andWhereRaw('c.name ILIKE ?', [`%${escapeLikePattern(search)}%`]);
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
        db.knex.raw('NULL::json AS json_schema'),
        db.knex.raw('NULL::text AS runs'),
        db.knex.raw('NULL::boolean AS auto_start'),
        db.knex.raw('NULL::boolean AS track_deletes'),
        db.knex.raw('true AS enabled'),
        db.knex.raw('NULL::timestamptz AS last_deployed'),
        db.knex.raw(`'live-catalog'::text AS source`),
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
