import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';

import { listCatalogEntries } from '../../../catalog/actions.js';
import { whereHttpTrigger } from '../../models/filters.js';
import { isTool } from '../../models/functions.js';

import type { CatalogEntry } from '../../../catalog/reader.js';
import type { FunctionListSource, FunctionListType, FunctionTags, NangoConfigMetadata, ToolTags } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';
import type { Knex } from 'knex';

export interface FunctionRow {
    id: number | null;
    tool: {
        uuid: string;
        integration_id: string;
        provider: string;
        tags: FunctionTags | ToolTags;
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

export type ScopedFunctionRow = FunctionRow & { integration_id: string };

export const listingOrderBy = "type = 'tool' DESC, type, name, event, id";

export type FunctionLookupScope = {
    environmentId: number;
    providerConfigKeys?: string[] | undefined;
};

export type IntegrationCatalogEntry = CatalogEntry & { integration_id: string };

export function integrationsInScope({ environmentId, providerConfigKeys }: FunctionLookupScope): Knex.QueryBuilder {
    const query = db.knex.from({ nc: '_nango_configs' }).where('nc.environment_id', environmentId).andWhere('nc.deleted', false);
    if (providerConfigKeys !== undefined) {
        query.whereIn('nc.unique_key', providerConfigKeys);
    }
    return query;
}

export function catalogForIntegration(integrationId: string, entries: CatalogEntry[]): IntegrationCatalogEntry[] {
    return entries.map((entry) => ({ ...entry, integration_id: integrationId }));
}

export async function catalogToolsEnabled(accountUuid: string | undefined): Promise<boolean> {
    if (!accountUuid) {
        return false;
    }
    return getFlags().hasCatalogTools(accountUuid);
}

export function catalogEntries(provider: string | undefined, type: FunctionListType | undefined, enabled: boolean): CatalogEntry[] {
    if (!enabled || !provider || type === 'sync' || type === 'on-event') {
        return [];
    }
    return listCatalogEntries(provider).filter((entry) => entry.type === 'action' || ('trigger' in entry && isTool(entry)));
}

export function markActionsEnabled<T extends { type: string | null; enabled: boolean | null }>(rows: T[]): T[] {
    return rows.map((row) => (row.type === 'action' && row.enabled !== true ? { ...row, enabled: true } : row));
}

export async function providerForConfig(environmentId: number, providerConfigKey: string): Promise<{ provider: string; accountUuid: string } | undefined> {
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

export function activeSyncConfigBase(scope: FunctionLookupScope): Knex.QueryBuilder {
    return integrationsInScope(scope)
        .join({ sc: '_nango_sync_configs' }, 'sc.nango_config_id', 'nc.id')
        .andWhere('sc.environment_id', scope.environmentId)
        .andWhere('sc.deleted', false)
        .andWhere('sc.active', true);
}

export function activeToolBase(scope: FunctionLookupScope): Knex.QueryBuilder {
    return integrationsInScope(scope)
        .join({ fc: 'function_configs' }, 'fc.nango_config_id', 'nc.id')
        .join({ fv: 'function_config_versions' }, function () {
            this.on('fv.id', 'fc.current_version_id').andOn('fv.function_config_id', 'fc.id');
        })
        .andWhere('fc.environment_id', scope.environmentId)
        .whereNull('fc.deleted_at')
        .whereNull('fv.deleted_at')
        .modify(whereHttpTrigger, { column: 'fv.trigger', subscriptions: 'none' });
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
        .modify(whereHttpTrigger, { column: 'fv.trigger', subscriptions: 'none' })
        .select(db.knex.raw('1'));
}

export function buildListingSubquery({
    type,
    search,
    catalog = [],
    includeOnEvents = true,
    ...scope
}: FunctionLookupScope & {
    type: FunctionListType | undefined;
    search: string | undefined;
    catalog?: IntegrationCatalogEntry[];
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
        branches.push(buildCatalogBranch({ ...scope, catalog, type, search }));
    }
    const union = branches.map(() => '?').join(' UNION ALL ');
    return db.knex.raw(`(${union}) AS listing`, branches);
}

/**
 * Keep only listing fields in SQL bindings; schemas are hydrated after pagination.
 */
function toCatalogListingBind(catalog: IntegrationCatalogEntry[]) {
    return catalog.map((entry) => ({
        integration_id: entry.integration_id,
        name: entry.name,
        type: entry.type === 'action' ? 'action' : 'tool',
        description: entry.description,
        scopes: entry.type === 'action' ? entry.scopes : [],
        input: entry.type === 'action' ? entry.input : null,
        output: entry.type === 'action' ? entry.output : [],
        tool:
            entry.type === 'action'
                ? null
                : {
                      uuid: entry.uuid,
                      integration_id: entry.integration_id,
                      provider: entry.provider,
                      tags: entry.tags ?? {},
                      input_schema_ref: entry.input_schema_ref,
                      output_schema_ref: entry.output_schema_ref
                  }
    }));
}

/**
 * Used to re-hydrate the json_schema field into the FunctionRow object.
 */
export function hydrateCatalogJsonSchemas(
    rows: Pick<ScopedFunctionRow, 'integration_id' | 'name' | 'source' | 'json_schema'>[],
    catalog: IntegrationCatalogEntry[]
): void {
    if (catalog.length === 0) {
        return;
    }

    const schemaByName = new Map(
        catalog.map((entry) => [JSON.stringify([entry.integration_id, entry.name]), entry.type === 'action' ? entry.jsonSchema : entry.json_schema])
    );
    for (const row of rows) {
        if (row.source !== 'tools-catalog') {
            continue;
        }
        row.json_schema = schemaByName.get(JSON.stringify([row.integration_id, row.name])) ?? null;
    }
}

function buildCatalogBranch({
    catalog,
    type,
    search,
    ...scope
}: FunctionLookupScope & {
    catalog: IntegrationCatalogEntry[];
    type: FunctionListType | undefined;
    search: string | undefined;
}): Knex.QueryBuilder {
    const catalogRows = db.knex.raw(
        `jsonb_to_recordset(?::jsonb) AS c(integration_id text, name text, type text, description text, scopes jsonb, input text, output text[], tool jsonb)`,
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

    if (type !== undefined) {
        query.whereIn('c.type', type === 'tool' ? ['action', 'tool'] : [type]);
    }

    if (search) {
        query.andWhereRaw('c.name ILIKE ?', [`%${escapeLikePattern(search)}%`]);
    }

    return query.select(
        'nc.unique_key AS integration_id',
        db.knex.raw('NULL::int AS id'),
        'c.name',
        'c.type',
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
        'c.tool'
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
