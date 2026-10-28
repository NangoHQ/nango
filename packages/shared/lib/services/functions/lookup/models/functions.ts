import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { SCHEMA_REF_PREFIX } from '@nangohq/utils';

import { listCatalogTools } from '../../../catalog/actions.js';

import type { CatalogTool } from '../../../catalog/actions.js';
import type { FunctionListSource, FunctionListType, FunctionSource, FunctionTags, NangoConfigMetadata } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';
import type { Knex } from 'knex';

export interface FunctionRow {
    id: number | null;
    tool: {
        uuid: string;
        integration_id: string;
        provider: string;
        tags: FunctionTags;
        input_schema_ref: string | null;
        output_schema_ref: string | null;
    } | null;
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

type ScopedFunctionRow = FunctionRow & { integration_id: string };

const listingOrderBy = "type = 'tool' DESC, type, name, event, id";

const resolutionOrderBy = "type = 'tool' DESC, type, event, id";

type FunctionLookupScope = {
    environmentId: number;
    providerConfigKeys?: string[] | undefined;
};

type IntegrationCatalogTool = CatalogTool & { integration_id: string };

function integrationsInScope({ environmentId, providerConfigKeys }: FunctionLookupScope): Knex.QueryBuilder {
    const query = db.knex.from({ nc: '_nango_configs' }).where('nc.environment_id', environmentId).andWhere('nc.deleted', false);
    if (providerConfigKeys !== undefined) {
        query.whereIn('nc.unique_key', providerConfigKeys);
    }
    return query;
}

function catalogForIntegration(integrationId: string, tools: CatalogTool[]): IntegrationCatalogTool[] {
    return tools.map((tool) => ({ ...tool, integration_id: integrationId }));
}

async function catalogInScope(scope: FunctionLookupScope): Promise<{ catalog: IntegrationCatalogTool[]; enabled: boolean }> {
    const integrations = await integrationsInScope(scope)
        .join({ env: '_nango_environments' }, 'nc.environment_id', 'env.id')
        .join({ account: '_nango_accounts' }, 'env.account_id', 'account.id')
        .select<
            { integration_id: string; provider: string; account_uuid: string }[]
        >('nc.unique_key AS integration_id', 'nc.provider', db.knex.raw('account.uuid as account_uuid'));
    const enabled = await catalogToolsEnabled(integrations[0]?.account_uuid);
    return {
        catalog: enabled
            ? integrations.flatMap((integration) => catalogForIntegration(integration.integration_id, listCatalogTools(integration.provider)))
            : [],
        enabled
    };
}

async function catalogToolsEnabled(accountUuid: string | undefined): Promise<boolean> {
    if (!accountUuid) {
        return false;
    }
    return getFlags().hasCatalogTools(accountUuid);
}

function catalogTools(provider: string | undefined, type: FunctionListType | undefined, enabled: boolean): CatalogTool[] {
    if (!enabled || !provider || (type !== undefined && type !== 'action' && type !== 'tool')) {
        return [];
    }
    return listCatalogTools(provider);
}

function markActionsEnabled<T extends { type: string | null; enabled: boolean | null }>(rows: T[]): T[] {
    return rows.map((row) => (row.type === 'action' && row.enabled !== true ? { ...row, enabled: true } : row));
}

async function providerForConfig(environmentId: number, providerConfigKey: string): Promise<{ provider: string; accountUuid: string } | undefined> {
    const row = await db.knex
        .from({ nc: '_nango_configs' })
        .join({ env: '_nango_environments' }, 'nc.environment_id', 'env.id')
        .join({ account: '_nango_accounts' }, 'env.account_id', 'account.id')
        .where('nc.environment_id', environmentId)
        .andWhere('nc.unique_key', providerConfigKey)
        .andWhere('nc.deleted', false)
        .select<{ provider: string; account_uuid: string }>('nc.provider', db.knex.raw('account.uuid as account_uuid'))
        .first();
    if (!row) {
        return undefined;
    }
    return { provider: row.provider, accountUuid: row.account_uuid };
}

async function accountUuidForEnvironment(environmentId: number): Promise<string | undefined> {
    const row = await db.knex
        .from({ env: '_nango_environments' })
        .join({ account: '_nango_accounts' }, 'env.account_id', 'account.id')
        .where('env.id', environmentId)
        .select<{ account_uuid: string }>(db.knex.raw('account.uuid as account_uuid'))
        .first();
    return row?.account_uuid;
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
    type: FunctionListType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
}): Promise<{ rows: FunctionRow[]; total: number }> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogTools(config?.provider, type, toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type,
        search,
        catalog
    });
    const [pageRows, countRow] = await Promise.all([
        db.knex.from(listing).select<ScopedFunctionRow[]>('*').orderByRaw(listingOrderBy).limit(limit).offset(offset),
        db.knex.from(listing).count<{ total: string }[]>('* as total').first()
    ]);

    const total = countRow ? Number(countRow.total) : 0;
    hydrateCatalogJsonSchemas(pageRows, catalog);
    return { rows: toolsCatalogEnabled ? markActionsEnabled(pageRows) : pageRows, total };
}

export async function findActiveActions({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Promise<FunctionRow[]> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogTools(config?.provider, 'action', toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type: 'action',
        search: undefined,
        catalog
    });
    const rows = await db.knex.from(listing).select<ScopedFunctionRow[]>('*').orderByRaw(listingOrderBy);
    hydrateCatalogJsonSchemas(rows, catalog);
    return toolsCatalogEnabled ? markActionsEnabled(rows) : rows;
}

/**
 * Returns unpaginated template availability, including native HTTP tool names so
 * action templates shadowed by those tools can be omitted.
 */
export async function findActiveFunctionAvailability({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<{ deployed: FunctionAvailabilityRow[]; toolNames: string[] }> {
    const [rows, tools, toolsCatalog] = await Promise.all([
        activeSyncConfigBase({ environmentId, providerConfigKeys: [providerConfigKey] })
            .select<FunctionAvailabilityRow[]>('sc.id', 'sc.sync_name AS name', 'sc.type', 'sc.enabled', 'sc.created_at AS last_deployed', 'sc.source')
            .orderBy([
                { column: 'sc.created_at', order: 'asc' },
                { column: 'sc.id', order: 'asc' }
            ]),
        activeToolBase({ environmentId, providerConfigKeys: [providerConfigKey] }).select<{ name: string }[]>('fc.name'),
        accountUuidForEnvironment(environmentId).then(catalogToolsEnabled)
    ]);
    return { deployed: toolsCatalog ? markActionsEnabled(rows) : rows, toolNames: tools.map(({ name }) => name) };
}

export interface IntegrationFunctionRow {
    integration_id: string;
    provider: string;
    name: string | null;
    type: 'sync' | 'action' | 'tool' | null;
    description: string | null;
    enabled: boolean | null;
}

/**
 * Returns every integration in the environment alongside its available sync, action and tool
 * functions (deployed rows plus catalog actions), one row per function and a single
 * row with null function columns for an integration that has none.
 *
 * A tool shadows a deployed or catalog action of the same name, disabled or not, the
 * same way tool resolution does.
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
    const scope = { environmentId, providerConfigKeys };
    const { catalog, enabled } = await catalogInScope(scope);
    const listing = buildListingSubquery({ ...scope, type: undefined, search: undefined, catalog, includeOnEvents: false });
    const rows = await integrationsInScope(scope)
        .leftJoin(listing, 'listing.integration_id', 'nc.unique_key')
        .select<IntegrationFunctionRow[]>(
            'nc.unique_key AS integration_id',
            'nc.provider',
            'listing.name',
            'listing.type',
            db.knex.raw("listing.metadata->>'description' AS description"),
            'listing.enabled'
        )
        .orderBy([
            { column: 'nc.unique_key', order: 'asc' },
            { column: 'listing.name', order: 'asc' },
            { column: 'listing.type', order: 'asc' }
        ]);
    return enabled ? markActionsEnabled(rows) : rows;
}

export interface ActionInputSchemaRow {
    integration_id: string;
    name: string;
    input: string | null;
    models_json_schema: { definitions?: Record<string, JSONSchema7> } | null;
}

/**
 * Returns the input model name and schema definitions for named actions and tools,
 * across as many integrations as the caller asks for in one batch.
 *
 * A tool occupies the name ahead of everything else, and a disabled one contributes no
 * schema. Otherwise an active deployed action occupies the name. When tools-catalog is on, that row contributes
 * its schema even if `_nango_sync_configs.enabled` is false. When the flag is off, a disabled
 * deployed row contributes no schema. The catalog is never a fallback for an occupied name,
 * and catalog schemas are returned only for unoccupied names.
 */
export async function findInputSchemas({
    environmentId,
    actions
}: {
    environmentId: number;
    actions: { integrationId: string; name: string }[];
}): Promise<ActionInputSchemaRow[]> {
    if (actions.length === 0) {
        return [];
    }

    const scope = { environmentId, providerConfigKeys: [...new Set(actions.map((action) => action.integrationId))] };
    const { catalog, enabled } = await catalogInScope(scope);
    const requested = new Set(actions.map((action) => JSON.stringify([action.integrationId, action.name])));
    const requestedCatalog = catalog.filter((tool) => requested.has(JSON.stringify([tool.integration_id, tool.name])));
    const listing = buildListingSubquery({ ...scope, type: 'tool', search: undefined, catalog: requestedCatalog });
    const rows = await db.knex
        .from(listing)
        .whereIn(
            ['integration_id', 'name'],
            actions.map((action) => [action.integrationId, action.name])
        )
        .andWhere(function () {
            this.where('enabled', true);
            if (enabled) {
                this.orWhere('type', 'action');
            }
        })
        .select<(Pick<FunctionRow, 'name' | 'type' | 'input' | 'json_schema' | 'source'> & { integration_id: string; input_schema_ref: string | null })[]>(
            'integration_id',
            'name',
            'type',
            'input',
            'json_schema',
            'source',
            db.knex.raw("tool->>'input_schema_ref' AS input_schema_ref")
        );
    hydrateCatalogJsonSchemas(rows, requestedCatalog);
    return rows.map((row) => {
        const input = row.type === 'tool' ? row.input_schema_ref : row.input;
        return {
            integration_id: row.integration_id,
            name: row.name,
            input: row.type === 'tool' && input?.startsWith(SCHEMA_REF_PREFIX) ? input.slice(SCHEMA_REF_PREFIX.length) : input,
            models_json_schema: row.json_schema as ActionInputSchemaRow['models_json_schema']
        };
    });
}

function activeSyncConfigBase(scope: FunctionLookupScope): Knex.QueryBuilder {
    return integrationsInScope(scope)
        .join({ sc: '_nango_sync_configs' }, 'sc.nango_config_id', 'nc.id')
        .andWhere('sc.environment_id', scope.environmentId)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true);
}

function activeToolBase(scope: FunctionLookupScope): Knex.QueryBuilder {
    return integrationsInScope(scope)
        .join({ fc: 'function_configs' }, 'fc.nango_config_id', 'nc.id')
        .join({ fv: 'function_config_versions' }, function () {
            this.on('fv.id', 'fc.current_version_id').andOn('fv.function_config_id', 'fc.id');
        })
        .andWhere('fc.environment_id', scope.environmentId)
        .whereNull('fc.deleted_at')
        .whereNull('fv.deleted_at')
        .andWhereRaw("fv.trigger->>'kind' = 'http'");
}

function activeToolNamed(nameColumn: string): Knex.QueryBuilder {
    return db.knex
        .from({ fc: 'function_configs' })
        .join({ fv: 'function_config_versions' }, function () {
            this.on('fv.id', 'fc.current_version_id').andOn('fv.function_config_id', 'fc.id');
        })
        .whereRaw('?? = ??', ['fc.nango_config_id', 'nc.id'])
        .whereRaw('?? = ??', ['fc.name', nameColumn])
        .whereNull('fc.deleted_at')
        .whereNull('fv.deleted_at')
        .andWhereRaw("fv.trigger->>'kind' = 'http'")
        .select(db.knex.raw('1'));
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
    type: FunctionListType | undefined;
}): Promise<FunctionRow | undefined> {
    const config = await providerForConfig(environmentId, providerConfigKey);
    const toolsCatalogEnabled = await catalogToolsEnabled(config?.accountUuid);
    const catalog = catalogForIntegration(providerConfigKey, catalogTools(config?.provider, type, toolsCatalogEnabled));
    const listing = buildListingSubquery({
        environmentId,
        providerConfigKeys: [providerConfigKey],
        type,
        search: undefined,
        catalog
    });

    const row = await db.knex.from(listing).select<ScopedFunctionRow[]>('*').where('name', name).orderByRaw(resolutionOrderBy).first();
    if (!row) {
        return undefined;
    }
    hydrateCatalogJsonSchemas([row], catalog);
    return toolsCatalogEnabled ? markActionsEnabled([row])[0] : row;
}

function buildListingSubquery({
    type,
    search,
    catalog = [],
    includeOnEvents = true,
    ...scope
}: FunctionLookupScope & {
    type: FunctionListType | undefined;
    search: string | undefined;
    catalog?: IntegrationCatalogTool[];
    includeOnEvents?: boolean;
}): Knex.Raw {
    const branches: Knex.QueryBuilder[] = [];
    if (type !== 'on-event') {
        branches.push(buildSyncConfigBranch({ ...scope, type: type === 'tool' ? 'action' : type, search }));
    }
    if (includeOnEvents && (type === undefined || type === 'on-event')) {
        branches.push(buildOnEventBranch({ ...scope, search }));
    }
    if (type === undefined || type === 'tool') {
        branches.push(buildToolBranch({ ...scope, search }));
    }
    if (catalog.length > 0 && type !== 'sync' && type !== 'on-event') {
        branches.push(buildCatalogBranch({ ...scope, catalog, search }));
    }
    const union = branches.map(() => '?').join(' UNION ALL ');
    return db.knex.raw(`(${union}) AS listing`, branches);
}

/**
 * Strip away the extra fields from the catalog action object that are not needed for the listing.
 * Mainly json_schema which can be large.
 */
function toCatalogListingBind(
    catalog: IntegrationCatalogTool[]
): Pick<IntegrationCatalogTool, 'integration_id' | 'name' | 'description' | 'scopes' | 'input' | 'output'>[] {
    return catalog.map((action) => ({
        integration_id: action.integration_id,
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
function hydrateCatalogJsonSchemas(
    rows: Pick<ScopedFunctionRow, 'integration_id' | 'name' | 'source' | 'json_schema'>[],
    catalog: IntegrationCatalogTool[]
): void {
    if (catalog.length === 0) {
        return;
    }

    const schemaByName = new Map(catalog.map((tool) => [JSON.stringify([tool.integration_id, tool.name]), tool.jsonSchema]));
    for (const row of rows) {
        if (row.source !== 'tools-catalog') {
            continue;
        }
        row.json_schema = schemaByName.get(JSON.stringify([row.integration_id, row.name])) ?? null;
    }
}

function buildCatalogBranch({
    catalog,
    search,
    ...scope
}: FunctionLookupScope & {
    catalog: IntegrationCatalogTool[];
    search: string | undefined;
}): Knex.QueryBuilder {
    const catalogRows = db.knex.raw(
        `jsonb_to_recordset(?::jsonb) AS c(integration_id text, name text, description text, scopes jsonb, input text, output text[])`,
        [JSON.stringify(toCatalogListingBind(catalog))]
    );

    const query = integrationsInScope(scope)
        .crossJoin(catalogRows)
        .whereRaw('nc.unique_key = c.integration_id')
        .whereNotExists(
            activeSyncConfigBase(scope)
                .andWhere('sc.type', 'action')
                .whereRaw('nc.unique_key = c.integration_id')
                .whereRaw('sc.sync_name = c.name')
                .select(db.knex.raw('1'))
        )
        .whereNotExists(activeToolNamed('c.name'));

    if (search) {
        query.andWhereRaw('c.name ILIKE ?', [`%${escapeLikePattern(search)}%`]);
    }

    return query.select(
        'nc.unique_key AS integration_id',
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
        db.knex.raw(`'tools-catalog'::text AS source`),
        db.knex.raw('NULL::text AS event'),
        db.knex.raw('NULL::jsonb AS tool')
    );
}

function buildSyncConfigBranch({
    type,
    search,
    ...scope
}: FunctionLookupScope & {
    type: 'sync' | 'action' | undefined;
    search: string | undefined;
}): Knex.QueryBuilder {
    // Cast on `source` (sync_config_source enum) is required for UNION ALL with the on-event branch —
    // Postgres only unions matching types.
    const query = activeSyncConfigBase(scope).select(
        'nc.unique_key AS integration_id',
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
        db.knex.raw('NULL::text AS event'),
        db.knex.raw('NULL::jsonb AS tool')
    );

    query.andWhere(function () {
        this.whereNot('sc.type', 'action').orWhereNotExists(activeToolNamed('sc.sync_name'));
    });

    if (type) {
        query.andWhere('sc.type', type);
    }

    if (search) {
        query.andWhereILike('sc.sync_name', `%${escapeLikePattern(search)}%`);
    }

    return query;
}

function buildOnEventBranch({
    search,
    ...scope
}: FunctionLookupScope & {
    search: string | undefined;
}): Knex.QueryBuilder {
    // `oes.event` is a script_trigger_event enum and must be cast to text for UNION ALL.
    const query = integrationsInScope(scope)
        .join({ oes: 'on_event_scripts' }, 'oes.config_id', 'nc.id')
        .andWhere('oes.active', true)
        .select(
            'nc.unique_key AS integration_id',
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
            db.knex.raw('CAST(oes.event AS text) AS event'),
            db.knex.raw('NULL::jsonb AS tool')
        );

    if (search) {
        query.andWhereILike('oes.name', `%${escapeLikePattern(search)}%`);
    }

    return query;
}

function buildToolBranch({
    search,
    ...scope
}: FunctionLookupScope & {
    search: string | undefined;
}): Knex.QueryBuilder {
    const query = activeToolBase(scope).select(
        'nc.unique_key AS integration_id',
        db.knex.raw('NULL::int AS id'),
        'fc.name',
        db.knex.raw("'tool'::text AS type"),
        db.knex.raw("jsonb_build_object('description', fv.description) AS metadata"),
        db.knex.raw('NULL::text AS input'),
        db.knex.raw('NULL::text[] AS returns'),
        db.knex.raw('fv.json_schema::json AS json_schema'),
        db.knex.raw('NULL::text AS runs'),
        db.knex.raw('NULL::boolean AS auto_start'),
        db.knex.raw('NULL::boolean AS track_deletes'),
        'fc.enabled',
        'fv.created_at AS last_deployed',
        db.knex.raw('fv.source::text AS source'),
        db.knex.raw('NULL::text AS event'),
        db.knex.raw(`jsonb_build_object(
                'uuid', fc.uuid, 'integration_id', nc.unique_key, 'provider', nc.provider,
                'tags', fv.tags, 'input_schema_ref', fv.input_schema_ref, 'output_schema_ref', fv.output_schema_ref
            ) AS tool`)
    );
    if (search) {
        query.andWhereILike('fc.name', `%${escapeLikePattern(search)}%`);
    }
    return query;
}

function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
