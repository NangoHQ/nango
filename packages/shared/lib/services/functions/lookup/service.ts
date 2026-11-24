import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { getCatalogFunctionByUuid } from '../../catalog/actions.js';
import { isCatalogFunctionUuid } from '../../catalog/uuid.js';
import configService from '../../config.service.js';
import * as inlineFunctionService from '../inline/service.js';
import { isInlineFunctionUuid } from '../inline/uuid.js';
import * as functionConfigService from '../models/functions.js';
import { toListedNangoFunction } from './mappers.js';
import * as functionsModel from './models/functions.js';
import * as legacyModel from './models/legacy.js';
import * as templatesModel from './models/templates.js';

import type { CatalogFunctionDefinition } from '../../catalog/reader.js';
import type { FunctionRow } from './models/listing.js';
import type {
    DBFunctionConfigVersion,
    FunctionListType,
    IntegrationConfig,
    ListedNangoActionFunction,
    ListedNangoFunction,
    NangoFunctionTemplate
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type ResolvedFunction = {
    uuid: string;
    name: string;
    enabled: boolean;
} & (
    | { kind: 'deployed'; integration: Pick<IntegrationConfig, 'unique_key' | 'provider'> & { id: number }; definition: DBFunctionConfigVersion }
    | { kind: 'catalog'; definition: CatalogFunctionDefinition }
);

export const INLINE_FUNCTION_NAME = 'inline';

export interface ResolvedInlineFunction {
    kind: 'inline';
    uuid: string;
    name: typeof INLINE_FUNCTION_NAME;
    enabled: true;
    code: string;
    description: string | null;
    agentSessionId: string;
    resultRecordId: string;
}

export type ListFunctionsErrorCode = 'integration_not_found' | 'list_failed';

export class ListFunctionsError extends Error {
    public readonly code: ListFunctionsErrorCode;

    constructor({ code, message, cause }: { code: ListFunctionsErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'ListFunctionsError';
        this.code = code;
    }
}

/** Attaches deployments to templates and omits templates replaced by native HTTP tools. */
export async function listTemplates({
    environmentId,
    providerConfigKey,
    templates
}: {
    environmentId: number;
    providerConfigKey: string;
    templates: NangoFunctionTemplate[];
}): Promise<Result<NangoFunctionTemplate[]>> {
    try {
        const availability = await templatesModel.findActiveFunctionAvailability({ environmentId, providerConfigKey });
        const hiddenByTool = new Set(availability.toolNames);
        const deployedByKey = new Map(availability.deployed.map((row) => [`${row.type}:${row.name}`, row]));
        return Ok(
            templates.flatMap((template) => {
                if (template.type === 'action' && hiddenByTool.has(template.name)) return [];
                const deployed = deployedByKey.get(`${template.type}:${template.name}`);
                return [
                    deployed
                        ? {
                              ...template,
                              deployed: {
                                  id: deployed.id,
                                  enabled: deployed.enabled,
                                  last_deployed: deployed.last_deployed.toISOString(),
                                  source: deployed.source
                              }
                          }
                        : template
                ];
            })
        );
    } catch (err) {
        return Err(new Error('Failed to list templates', { cause: err }));
    }
}

/**
 * Lists functions for a single integration: deployed syncs/actions/on-events/tools plus
 * catalog actions, with shared filtering and pagination.
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
    type: FunctionListType | undefined;
    search: string | undefined;
    limit: number;
    offset: number;
}): Promise<Result<{ rows: ListedNangoFunction[]; total: number }, ListFunctionsError>> {
    try {
        const integrationId = await configService.getIdByProviderConfigKey(environmentId, providerConfigKey);
        if (!integrationId) {
            return Err(
                new ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            );
        }

        const page = await functionsModel.findActiveByEnvironment({
            environmentId,
            providerConfigKey,
            type,
            search,
            limit,
            offset
        });
        return mapListingPage(page);
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Lists all action functions for a single integration without pagination.
 * When tools-catalog is on, every action is reported enabled. When it is off,
 * disabled actions are still included so callers can decide how to expose them.
 */
export async function listActions({
    environmentId,
    providerConfigKey
}: {
    environmentId: number;
    providerConfigKey: string;
}): Promise<Result<{ actions: ListedNangoActionFunction[]; provider: string }, ListFunctionsError>> {
    try {
        const integration = await configService.getProviderConfig(providerConfigKey, environmentId);
        if (!integration) {
            return Err(
                new ListFunctionsError({
                    code: 'integration_not_found',
                    message: 'Integration does not exist'
                })
            );
        }

        const rows = await legacyModel.findActiveActions({ environmentId, providerConfigKey });
        const mapped = mapListingRows(rows);
        if (mapped.isErr()) {
            return Err(mapped.error);
        }

        return Ok({
            actions: mapped.value.filter((row): row is ListedNangoActionFunction => row.type === 'action'),
            provider: integration.provider
        });
    } catch (err) {
        return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: err }));
    }
}

/**
 * Fetches a single function by name within a provider config.
 * If `type` is omitted and multiple types share the same name, the first
 * match by the listing's stable order is returned. Deployed rows win over catalog.
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
    type: FunctionListType | undefined;
}): Promise<Result<ListedNangoFunction | undefined>> {
    try {
        const row = await functionsModel.findActiveByName({ environmentId, providerConfigKey, name, type });
        if (!row) {
            return Ok(undefined);
        }

        const fn = toListedNangoFunction(row);
        if (fn.isErr()) {
            return Err(new Error('failed_to_get_function', { cause: fn.error }));
        }
        return Ok(fn.value);
    } catch (err) {
        return Err(new Error('failed_to_get_function', { cause: err }));
    }
}

// Inline functions are agent session code, so only callers that run them ask for them.
export async function resolveFunctionByUuid(args: {
    environmentId: number;
    functionUuid: string;
    includeInline: true;
}): Promise<Result<ResolvedFunction | ResolvedInlineFunction | undefined>>;
export async function resolveFunctionByUuid(args: {
    environmentId: number;
    functionUuid: string;
    includeInline?: false;
}): Promise<Result<ResolvedFunction | undefined>>;
export async function resolveFunctionByUuid({
    environmentId,
    functionUuid,
    includeInline = false
}: {
    environmentId: number;
    functionUuid: string;
    includeInline?: boolean;
}): Promise<Result<ResolvedFunction | ResolvedInlineFunction | undefined>> {
    try {
        const uuid = functionUuid.toLowerCase();
        if (isInlineFunctionUuid(uuid)) {
            if (!includeInline) {
                return Ok(undefined);
            }
            const inlineFunction = await inlineFunctionService.get(db.knex, { environmentId, uuid });
            if (inlineFunction.isErr()) {
                return Err(new Error('failed_to_get_function_by_uuid', { cause: inlineFunction.error }));
            }
            if (!inlineFunction.value) {
                return Ok(undefined);
            }
            const { code, description, agentSessionId, resultRecordId } = inlineFunction.value;
            return Ok({ kind: 'inline', uuid, name: INLINE_FUNCTION_NAME, enabled: true, code, description, agentSessionId, resultRecordId });
        }
        if (isCatalogFunctionUuid(uuid)) {
            const definition = getCatalogFunctionByUuid(uuid);
            return Ok(definition ? { kind: 'catalog', uuid: definition.uuid, name: definition.name, enabled: true, definition } : undefined);
        }
        const functions = await functionConfigService.search(db.knex, { environmentId, filter: { uuid: functionUuid } });
        if (functions.isErr()) {
            return Err(new Error('failed_to_get_function_by_uuid', { cause: functions.error }));
        }
        const fn = functions.value[0];
        if (functions.value.length !== 1 || !fn) {
            return Ok(undefined);
        }
        return Ok({
            kind: 'deployed',
            uuid: fn.config.uuid,
            name: fn.config.name,
            enabled: fn.config.enabled,
            integration: fn.integration,
            definition: fn.currentVersion
        });
    } catch (err) {
        return Err(new Error('failed_to_get_function_by_uuid', { cause: err }));
    }
}

function mapListingPage(page: { rows: FunctionRow[]; total: number }): Result<{ rows: ListedNangoFunction[]; total: number }, ListFunctionsError> {
    const mapped = mapListingRows(page.rows);
    if (mapped.isErr()) {
        return Err(mapped.error);
    }
    return Ok({ rows: mapped.value, total: page.total });
}

function mapListingRows(rows: FunctionRow[]): Result<ListedNangoFunction[], ListFunctionsError> {
    const mapped: ListedNangoFunction[] = [];
    for (const row of rows) {
        const fn = toListedNangoFunction(row);
        if (fn.isErr()) {
            return Err(new ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions', cause: fn.error }));
        }
        mapped.push(fn.value);
    }
    return Ok(mapped);
}
