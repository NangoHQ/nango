// `id` and `recordedAt` are stamped downstream by ingestion, not by the caller.

export type AuditActorType = 'user' | 'api_key' | 'function' | 'system';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditTargetType = 'connection' | 'member';

export interface AuditActor {
    type: AuditActorType;
    id: string;
    display?: string;
}

export interface AuditTarget {
    type: AuditTargetType;
    id: string;
    display?: string;
}

export interface AuditContext {
    ip?: string;
    userAgent?: string;
}

export interface MemberRoleChangedMetadata {
    // Optional: capturing it needs pre-update state a route-level emit may not have.
    fromRole?: string;
    toRole: string;
}

interface AuditEventCommon {
    occurredAt: string;
    accountId: number;
    environmentId: number | null;
    actor: AuditActor;
    via?: AuditActor[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
}

export type AuditEvent =
    | (AuditEventCommon & { resource: 'connection'; action: 'deleted' })
    | (AuditEventCommon & { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata });

export type AuditResource = AuditEvent['resource'];
export type AuditAction = AuditEvent['action'];
