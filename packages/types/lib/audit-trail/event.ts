// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'system';
export type AuditTargetType = 'connection' | 'member';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditResource = 'connection' | 'member';
export type AuditAction = 'deleted' | 'role_changed';
export type AuditScope = 'account' | 'environment';

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

// Every endpoint must declare an audit policy on its `Endpoint` definition: either the audit event it
// records, or an explicit `NoAuditEvent` opt-out. This makes audit coverage a compile-time decision —
// a new endpoint cannot be added without consciously opting in or out.
export interface AuditEndpointEvent {
    resource: AuditResource;
    action: AuditAction;
    scope: AuditScope;
}
export interface NoAuditEvent {
    reason: string;
}
export type EndpointAuditPolicy = AuditEndpointEvent | NoAuditEvent;
