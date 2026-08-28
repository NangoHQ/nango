import db from '@nangohq/database';
import { configService, customerKeyService, environmentService, userService } from '@nangohq/shared';

import { toAuditId as toId } from '../../audit.js';
import { auditEnrichmentFailed, resolveDisplay } from './auditable.js';
import { nonEmptyString, omitUndefined, positiveInt } from './input.js';

import type { RequestLocals } from '../../utils/express.js';
import type { AuditTarget, AuditTargetType } from '@nangohq/audit';
import type { IntegrationProviderMetadata } from '@nangohq/types';
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

export async function environmentFromBody(value: unknown, locals: Partial<RequestLocals>): Promise<{ id: number; name: string } | null> {
    const environmentId = positiveInt(value);
    if (environmentId === undefined || !locals.account) {
        return null;
    }
    const environment = await environmentService.getByIdWithoutSecrets(environmentId, locals.account.id);
    return environment ? { id: environment.id, name: environment.name } : null;
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

export function apiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', value, async (id) => {
        if (!locals.environment) {
            return undefined;
        }
        const result = await customerKeyService.getApiKeysByEnv(db.knex, locals.environment.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value.find((key) => String(key.id) === id)?.display_name;
    });
}

export function accountApiKeyTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', value, async (id) => {
        const numericId = positiveInt(id);
        // Audit runs before controller param validation; skip the DB lookup for malformed
        // keyIds so bad deletes return 400 without an audit display-resolution warning.
        if (numericId === undefined || !locals.account) {
            return undefined;
        }
        const result = await customerKeyService.getAccountApiKeyDisplayName(db.knex, numericId, locals.account.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value;
    });
}

export function publicEnvApiKeyTarget(keyId: unknown, environmentId: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('api_key', keyId, async (id) => {
        const numericId = positiveInt(id);
        const numericEnvId = positiveInt(environmentId);
        if (numericId === undefined || numericEnvId === undefined || !locals.account) {
            return undefined;
        }
        const result = await customerKeyService.getApiKeyDisplayName(db.knex, numericId, numericEnvId, locals.account.id);
        if (result.isErr()) {
            throw result.error;
        }
        return result.value;
    });
}

export function accountEnvironmentTarget(value: unknown, locals: Partial<RequestLocals>): Promise<AuditTarget | undefined> {
    return dbTarget('environment', value, async (id) => {
        const numericId = Number(id);
        if (Number.isNaN(numericId) || !locals.account) {
            return undefined;
        }
        const environment = await environmentService.getByIdWithoutSecrets(numericId, locals.account.id);
        return environment?.name;
    });
}
