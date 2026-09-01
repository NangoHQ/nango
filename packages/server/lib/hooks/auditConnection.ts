import { getLogger } from '@nangohq/utils';

import { auditEventDropped, connectSessionActor, makeAuditTarget as makeTarget, recordAuditEvent, UNKNOWN_ACTOR } from '../audit.js';
import { canRecordAuditTrailForAccount } from '../utils/auditTrail.js';

import type { AuditActor, AuditAttribution, AuditEvent, NoAttribution } from '@nangohq/audit';
import type { AuthOperationType, InternalEndUser } from '@nangohq/types';
import type { Request } from 'express';

const logger = getLogger('Audit');

// `resolveActor` only reports what a request proves, so a connect session's end user arrives on the payload
// instead — the OAuth callback has no locals at all. With neither, naming nobody is honest.
export function connectionCreatedActor(actor: AuditActor | undefined, endUser: InternalEndUser | null | undefined): AuditActor {
    if (actor && actor.type !== 'unknown') {
        return actor;
    }
    if (endUser) {
        return connectSessionActor(endUser);
    }
    return UNKNOWN_ACTOR;
}

// The connectionCreated hook is the choke point every creation flow passes through.
export async function recordConnectionCreated(params: {
    connectionId: string;
    providerConfigKey: string;
    operation: AuthOperationType;
    account: { id: number; uuid: string };
    environment: { id: number; uuid: string; name: string };
    endUser?: InternalEndUser | null | undefined;
    auditAttribution: AuditAttribution | NoAttribution;
}): Promise<void> {
    try {
        // The hook also runs when re-authorizing an existing connection, which upserts and reports `override`.
        if (params.operation !== 'creation') {
            return;
        }
        if (!(await canRecordAuditTrailForAccount(params.account))) {
            return;
        }
        const occurredAt = new Date().toISOString();
        const attributed = params.auditAttribution.kind === 'request' ? params.auditAttribution : undefined;
        const target = makeTarget('connection', params.connectionId);
        const event: AuditEvent = {
            occurredAt,
            accountId: params.account.id,
            environment: { id: params.environment.uuid, display: params.environment.name },
            actor: connectionCreatedActor(attributed?.actor, params.endUser),
            resource: 'connection',
            action: 'created',
            targets: target ? [target] : [],
            context: attributed?.context ?? {},
            outcome: 'success',
            metadata: { providerConfigKey: params.providerConfigKey }
        };
        await recordAuditEvent(event);
    } catch (err) {
        logger.error(`failed to emit connection.created audit event`, err);
        auditEventDropped('connection', 'build_failed');
    }
}

/**
 * A request can upsert more than once — a CUSTOM OAuth install completes with a second upsert whose
 * operation is `override` — so a creation already recorded this request is never downgraded, or the route
 * audit would drop the event it exists to record.
 */
export function noteConnectionUpsert(req: Request, upsert: NonNullable<Express.AuditFacts['connectionUpsert']>): void {
    if (req.audit?.connectionUpsert?.operation === 'creation' && upsert.operation !== 'creation') {
        return;
    }
    req.audit = { ...req.audit, connectionUpsert: upsert };
}
