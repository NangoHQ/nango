import { getFlags } from '@nangohq/feature-flags';
import { getLogger } from '@nangohq/utils';

import { audit, makeAuditTarget as makeTarget } from '../audit.js';
import { UNKNOWN_ACTOR } from './audit.middleware.js';

import type { AuditActor, AuditAttribution, AuditEvent } from '@nangohq/audit';
import type { AuthOperationType, InternalEndUser } from '@nangohq/types';

const logger = getLogger('Audit');

// `resolveActor` only reports what a request proves, so a connect session's end user arrives on the payload
// instead — the OAuth callback has no locals at all. With neither, naming nobody is honest.
function connectionCreatedActor(actor: AuditActor | undefined, endUser: InternalEndUser | null | undefined): AuditActor {
    if (actor && actor.type !== 'unknown') {
        return actor;
    }
    if (endUser) {
        return { type: 'connect_session', id: endUser.endUserId, ...(endUser.email ? { display: endUser.email } : {}) };
    }
    return UNKNOWN_ACTOR;
}

// Emitted from the connectionCreated hook, the choke point every creation flow passes through.
export async function recordConnectionCreated(params: {
    connectionId: string;
    providerConfigKey: string;
    operation: AuthOperationType;
    account: { id: number; uuid: string };
    environment: { id: number; name: string };
    endUser?: InternalEndUser | null | undefined;
    auditAttribution?: AuditAttribution | undefined;
}): Promise<void> {
    const occurredAt = new Date().toISOString();
    try {
        // The hook also runs when re-authorizing an existing connection, which upserts and reports `override`.
        if (params.operation !== 'creation') {
            return;
        }
        if (!(await getFlags().isAuditTrailEnabled(params.account.uuid))) {
            return;
        }
        const target = makeTarget('connection', params.connectionId);
        const event = {
            occurredAt,
            accountId: params.account.id,
            environment: { id: params.environment.id, display: params.environment.name },
            actor: connectionCreatedActor(params.auditAttribution?.actor, params.endUser),
            resource: 'connection',
            action: 'created',
            targets: target ? [target] : [],
            context: params.auditAttribution?.context ?? {},
            outcome: 'success',
            metadata: { providerConfigKey: params.providerConfigKey }
        } as AuditEvent;
        const result = await audit.record(event);
        if (result.isErr()) {
            logger.error(`failed to record connection.created audit event`, result.error);
        }
    } catch (err) {
        logger.error(`failed to emit connection.created audit event`, err);
    }
}
