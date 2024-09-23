import * as crypto from 'crypto';
import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';
import type { EntityType, PrivateKey } from '../types.js';
import { getEncryption } from '../utils/encryption.js';

export const PRIVATE_KEYS_TABLE = 'private_keys';

type PrivateKeyErrorCodes = 'not_found' | 'invalid' | 'creation_failed';
export class PrivateKeyError extends Error {
    public code: PrivateKeyErrorCodes;
    public payload?: Record<string, unknown>;
    constructor({ code, message, payload }: { code: PrivateKeyErrorCodes; message: string; payload?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.payload = payload || {};
    }
}

export interface DbPrivateKey {
    readonly id: number;
    readonly display_name: string;
    readonly encrypted: Buffer;
    readonly hash: string;
    readonly created_at: Date;
    readonly deleted_at: Date | null;
    readonly expires_at: Date | null;
    readonly last_access_at: Date | null;
    readonly entity_type: EntityType;
    readonly entity_id: number;
}
type DbInsertPrivateKey = Omit<DbPrivateKey, 'id' | 'created_at' | 'deleted_at' | 'last_access_at'>;

export const DbPrivateKey = {
    to: (key: PrivateKey): DbPrivateKey => {
        return {
            id: key.id,
            display_name: key.displayName,
            encrypted: key.encrypted,
            hash: key.hash,
            created_at: key.createdAt,
            deleted_at: key.deletedAt,
            expires_at: key.expiresAt,
            last_access_at: key.lastAccessAt,
            entity_type: key.entityType,
            entity_id: key.entityId
        };
    },
    from: (dbKey: DbPrivateKey): PrivateKey => {
        return {
            id: dbKey.id,
            displayName: dbKey.display_name,
            encrypted: dbKey.encrypted,
            hash: dbKey.hash,
            createdAt: dbKey.created_at,
            deletedAt: dbKey.deleted_at,
            expiresAt: dbKey.expires_at,
            lastAccessAt: dbKey.last_access_at,
            entityType: dbKey.entity_type,
            entityId: dbKey.entity_id
        };
    }
};

export async function createPrivateKey(
    db: knex.Knex,
    { displayName, entityType, entityId, ttlInMs }: Pick<PrivateKey, 'displayName' | 'entityType' | 'entityId'> & { ttlInMs?: number }
): Promise<Result<string, PrivateKeyError>> {
    const now = new Date();
    const prefix = entityType.slice(0, 4);
    const random = crypto.randomBytes(32).toString('hex');
    const keyValue = `nango_${prefix}_${random}`;
    const key: DbInsertPrivateKey = {
        display_name: displayName,
        encrypted: encryptValue(keyValue),
        hash: hashValue(keyValue),
        expires_at: ttlInMs ? new Date(now.getTime() + ttlInMs) : null,
        entity_type: entityType,
        entity_id: entityId
    };
    const [dbKey] = await db.into(PRIVATE_KEYS_TABLE).insert(key).returning('*');
    if (!dbKey) {
        return Err(new PrivateKeyError({ code: 'creation_failed', message: 'Failed to create private key' }));
    }
    return Ok(keyValue);
}

export async function getPrivateKey(
    db: knex.Knex,
    { keyValue, entityType }: { keyValue: string; entityType: EntityType }
): Promise<Result<PrivateKey, PrivateKeyError>> {
    const now = new Date();
    const [key] = await db
        .update({ last_access_at: now })
        .from<DbPrivateKey>(PRIVATE_KEYS_TABLE)
        .where({ hash: hashValue(keyValue), entity_type: entityType, deleted_at: null })
        .andWhere((builder) => builder.whereNull('expires_at').orWhere('expires_at', '>', now))
        .returning('*');
    if (!key) {
        return Err(
            new PrivateKeyError({
                code: 'not_found',
                message: `Private key not found`,
                payload: {
                    keyValue: keyValue.substring(0, 8),
                    entityType
                }
            })
        );
    }
    return Ok(DbPrivateKey.from(key));
}

export async function deletePrivateKey(
    db: knex.Knex,
    { keyValue, entityType }: { keyValue: string; entityType: EntityType }
): Promise<Result<void, PrivateKeyError>> {
    const now = new Date();
    const [key] = await db
        .update({ last_access_at: now, deleted_at: now })
        .from<DbPrivateKey>(PRIVATE_KEYS_TABLE)
        .where({ hash: hashValue(keyValue), entity_type: entityType, deleted_at: null })
        .returning('*');
    if (!key) {
        return Err(new PrivateKeyError({ code: 'not_found', message: `Private key not found` }));
    }
    return Ok(undefined);
}

export function decryptPrivateKey(key: PrivateKey): Result<string, PrivateKeyError> {
    return decryptValue(key.encrypted);
}

function encryptValue(keyValue: string): Buffer {
    const encryption = getEncryption();
    const [encrypted, iv, tag] = encryption.encrypt(keyValue);
    return Buffer.from(`${encrypted}:${iv}:${tag}`);
}

function decryptValue(encryptedValue: Buffer): Result<string, PrivateKeyError> {
    const encryption = getEncryption();
    const [encrypted, iv, tag] = encryptedValue.toString().split(':');
    if (!encrypted || !iv || !tag) {
        return Err(new PrivateKeyError({ code: 'invalid', message: 'Invalid encrypted value' }));
    }
    return Ok(encryption.decrypt(encrypted, iv, tag));
}

function hashValue(keyValue: string): string {
    return keyValue;
}
