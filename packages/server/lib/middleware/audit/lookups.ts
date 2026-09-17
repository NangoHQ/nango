import db from '@nangohq/database';
import { configService, customerKeyService, environmentService, userService } from '@nangohq/shared';

import { toAuditId as toId } from '../../audit.js';
import { auditEnrichmentFailed, resolveDisplay } from './auditable.js';
import { nonEmptyString, omitUndefined, positiveInt, uuid } from './input.js';

import type { RequestLocals } from '../../utils/express.js';
import type { AuditTarget, AuditTargetType } from '@nangohq/audit';
import type { ApiKeyRef } from '@nangohq/shared';
import type { DBCustomerKey, IntegrationProviderMetadata } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Request } from 'express';

// Target whose display is looked up from the DB best-effort; failures degrade to no display.
async function dbTarget(type: AuditTargetType, value: unknown, lookup: (id: string) => Promise<string | undefined>): Promise<AuditTarget | undefined> {
    const id = toId(value);
    if (!id) {
        return undefined;
    }
    const display = await resolveDisplay(type, () => lookup(id));
    return { type, id, ...(display ? { display } : {}) };
}

export function memberTarget(req: Request<{ id: number }>, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('member', req.params.id, async (id) => {
        if (!locals.account) {
            return undefined;
        }
        const user = await userService.getUserByIdAndAccountId(Number(id), locals.account.id);
        return user?.email;
    });
}

export async function environmentFromUuid(value: unknown, locals: Partial<RequestLocals>): Promise<{ uuid: string; name: string } | null> {
    const environmentUuid = uuid(value);
    if (!environmentUuid || !locals.account) {
        return null;
    }
    const environment = await environmentService.getByUuidWithoutSecrets(environmentUuid, locals.account.id);
    return environment ? { uuid: environment.uuid, name: environment.name } : null;
}

export function integrationTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('integration', value, async (id) => {
        if (!locals.environment) {
            return undefined;
        }
        const summary = await configService.getIntegrationSummary(locals.environment.id, id);
        return summary?.display_name ?? undefined;
    });
}

export async function integrationProviderMeta(value: unknown, locals: Partial<RequestLocals>): Promise<IntegrationProviderMetadata | undefined> {
    const key = nonEmptyString(value);
    if (!key || !locals.environment) {
        return undefined;
    }
    try {
        const summary = await configService.getIntegrationSummary(locals.environment.id, key);
        return omitUndefined<IntegrationProviderMetadata>({ provider: summary?.provider });
    } catch (err) {
        auditEnrichmentFailed('metadata', 'integration', err);
        return undefined;
    }
}

async function apiKeyRef(lookup: () => Promise<Result<DBCustomerKey[]>>): Promise<ApiKeyRef | undefined> {
    try {
        const result = await lookup();
        if (result.isErr()) {
            throw result.error;
        }
        const key = result.value[0];
        return key ? { uuid: key.uuid, display_name: key.display_name } : undefined;
    } catch (err) {
        auditEnrichmentFailed('display', 'api_key', err);
        return undefined;
    }
}

function apiKeyTargetFrom(ref: ApiKeyRef | undefined): AuditTarget | undefined {
    return ref ? { type: 'api_key', id: ref.uuid, ...(ref.display_name ? { display: ref.display_name } : {}) } : undefined;
}

/** Not dbTarget: the route names the key by its internal id, so the target id comes from the lookup. */
export async function apiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    const numericId = positiveInt(value);
    if (numericId === undefined || !locals.environment || !locals.account) {
        return undefined;
    }
    const environmentId = locals.environment.id;
    const accountId = locals.account.id;
    return apiKeyTargetFrom(await apiKeyRef(() => customerKeyService.search(db.knex, { type: 'environment', environmentId, accountId, keyId: numericId })));
}

export async function accountApiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    const numericId = positiveInt(value);
    // Audit runs before controller param validation; skip the DB lookup for malformed
    // keyIds so bad deletes return 400 without an audit display-resolution warning.
    if (numericId === undefined || !locals.account) {
        return undefined;
    }
    const accountId = locals.account.id;
    return apiKeyTargetFrom(await apiKeyRef(() => customerKeyService.search(db.knex, { type: 'account', accountId, keyId: numericId })));
}

export function publicEnvApiKeyTarget(keyUuid: unknown, environmentUuid: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    const validKeyUuid = uuid(keyUuid);
    const validEnvironmentUuid = uuid(environmentUuid);
    const account = locals.account;
    if (!validKeyUuid || !validEnvironmentUuid || !account) {
        return Promise.resolve(undefined);
    }

    return dbTarget('api_key', validKeyUuid, async (id) => {
        const environment = await environmentService.getByUuidWithoutSecrets(validEnvironmentUuid, account.id);
        if (!environment) {
            return undefined;
        }
        const result = await customerKeyService.search(db.knex, { type: 'environment', environmentId: environment.id, accountId: account.id, keyUuid: id });
        if (result.isErr()) {
            throw result.error;
        }
        return result.value[0]?.display_name;
    });
}

export function accountEnvironmentTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    const environmentUuid = uuid(value);
    const account = locals.account;
    if (!environmentUuid || !account) {
        return Promise.resolve(undefined);
    }

    return dbTarget('environment', environmentUuid, async (id) => {
        const environment = await environmentService.getByUuidWithoutSecrets(id, account.id);
        return environment?.name;
    });
}
