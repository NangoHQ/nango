export type EntityType = 'connect_session' | 'connection' | 'environment' | 'agent_session';

// Agent sessions have a UUID primary key, every other entity an integer id.
export type PrivateKeyEntityRef = { entityType: Exclude<EntityType, 'agent_session'>; entityId: number } | { entityType: 'agent_session'; entityUuid: string };

export interface PrivateKey {
    readonly id: number;
    readonly displayName: string;
    readonly environmentId: number;
    readonly accountId: number;
    readonly encrypted: Buffer | null;
    readonly hash: string;
    readonly createdAt: Date;
    readonly expiresAt: Date | null;
    readonly lastAccessAt: Date | null;
    readonly entityType: EntityType;
    readonly entityId: number | null;
    readonly entityUuid: string | null;
}
