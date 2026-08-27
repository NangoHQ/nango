// `id` and `version` are stamped at the emit boundary, not by the caller.

import type {
    AuditActionOf,
    AuditActor,
    AuditContext,
    AuditMetadataFor,
    AuditOutcome,
    AuditResource,
    AuditTarget,
    AuditTrailVersion,
    AuditVia
} from '@nangohq/types';

export type {
    AuditActor,
    AuditActorType,
    AuditAttribution,
    NoAttribution,
    AuditContext,
    AuditEventKey,
    AuditInterface,
    AuditOutcome,
    AuditTarget,
    AuditTargetType,
    AuditVia,
    AuditResource,
    AuditAction,
    AuditTrailVersion
} from '@nangohq/types';

interface AuditEventCommon {
    occurredAt: string;
    accountId: number;
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditVia[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
}

// Derived from the vocabulary, so the union and the metadata it carries cannot disagree.
export type { AuditMetadataFor } from '@nangohq/types';

export type AuditResourceAction = {
    [R in AuditResource]: {
        [A in AuditActionOf<R>]: [AuditMetadataFor<R, A>] extends [never]
            ? { resource: R; action: A }
            : { resource: R; action: A; metadata?: AuditMetadataFor<R, A> };
    }[AuditActionOf<R>];
}[AuditResource];

export type AuditEvent = AuditEventCommon & AuditResourceAction;

export type StoredAuditEvent = AuditEvent & { id: string; version: AuditTrailVersion };
