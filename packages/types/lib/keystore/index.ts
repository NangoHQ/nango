export type EntityType = 'session' | 'connection' | 'environment';

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
    readonly entityId: number;
}
