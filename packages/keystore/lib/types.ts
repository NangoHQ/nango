export const entityTypes = ['session', 'connection', 'environment'] as const;
export type EntityType = (typeof entityTypes)[number];

export interface PrivateKey {
    readonly id: number;
    readonly displayName: string;
    readonly encrypted: Buffer;
    readonly hash: string;
    readonly createdAt: Date;
    readonly deletedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly lastAccessAt: Date | null;
    readonly entityType: EntityType;
    readonly entityId: number;
}
