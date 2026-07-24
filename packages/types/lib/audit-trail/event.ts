// Canonical audit event vocabulary — the single source of truth shared by the emit side
// (@nangohq/audit's AuditEvent) and the read/API side (ApiAuditTrailEvent).
export type AuditTrailVersion = '2026-07-16';
export type AuditActorType = 'user' | 'api_key' | 'system';
export type AuditTargetType = 'connection' | 'member';
export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditResource = 'connection' | 'member';
export type AuditAction = 'deleted' | 'role_changed';

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
