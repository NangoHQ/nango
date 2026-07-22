// `id` and `version` are stamped downstream by the store at write, not by the caller.

import type { AuditActor, AuditContext, AuditOutcome, AuditTarget } from '@nangohq/types';

// Re-export the shared vocabulary so @nangohq/audit consumers (e.g. the server audit middleware) keep
// importing these from here.
export type {
    AuditActor,
    AuditActorType,
    AuditContext,
    AuditOutcome,
    AuditTarget,
    AuditTargetType,
    AuditResource,
    AuditAction,
    AuditTrailVersion
} from '@nangohq/types';

export interface ConnectionDeletedMetadata {
    // Qualifies the target: connection_id is unique only per (provider config key, environment).
    providerConfigKey: string;
}

export interface MemberRoleChangedMetadata {
    // Optional: capturing it needs pre-update state a route-level emit may not have.
    fromRole?: string;
    toRole: string;
}

interface AuditEventCommon {
    occurredAt: string;
    accountId: number;
    // null for account-scoped events (e.g. member changes) that aren't tied to an environment.
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditActor[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
}

export type AuditEvent =
    | (AuditEventCommon & { resource: 'connection'; action: 'deleted'; metadata?: ConnectionDeletedMetadata })
    | (AuditEventCommon & { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata });
