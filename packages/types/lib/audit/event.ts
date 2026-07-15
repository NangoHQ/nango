// `id` and `recordedAt` are stamped downstream by ingestion, not by the caller.

export type AuditActorType = 'user' | 'api_key' | 'system';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditTargetType = 'connection' | 'member';

// Defined as `type` (not `interface`) so the shapes carry an implicit index signature and
// satisfy the pub/sub `Serializable` payload constraint on AuditRecordedEvent.
export type AuditActor = {
    type: AuditActorType;
    id: string;
    display?: string;
};

export type AuditTarget = {
    type: AuditTargetType;
    id: string;
    display?: string;
};

export type AuditContext = {
    ip?: string;
    userAgent?: string;
};

export type ConnectionDeletedMetadata = {
    // Qualifies the target: connection_id is unique only per (provider config key, environment).
    providerConfigKey: string;
};

export type MemberRoleChangedMetadata = {
    // Optional: capturing it needs pre-update state a route-level emit may not have.
    fromRole?: string;
    toRole: string;
};

type AuditEventCommon = {
    occurredAt: string;
    accountId: number;
    // null for account-scoped events (e.g. member changes) that aren't tied to an environment.
    environment: { id: number; display: string } | null;
    actor: AuditActor;
    via?: AuditActor[];
    targets: AuditTarget[];
    context: AuditContext;
    outcome: AuditOutcome;
};

export type AuditEvent =
    | (AuditEventCommon & { resource: 'connection'; action: 'deleted'; metadata?: ConnectionDeletedMetadata })
    | (AuditEventCommon & { resource: 'member'; action: 'role_changed'; metadata?: MemberRoleChangedMetadata });

export type AuditResource = AuditEvent['resource'];
export type AuditAction = AuditEvent['action'];
