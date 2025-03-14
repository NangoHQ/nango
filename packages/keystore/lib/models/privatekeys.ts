import * as crypto from 'crypto';
import type knex from 'knex';
import type { Result } from '@nangohq/utils';
import { Ok, Err } from '@nangohq/utils';
import type { EntityType, PrivateKey } from '@nangohq/types';
import { getEncryption, hashValue } from '../utils/encryption.js';

export const PRIVATE_KEYS_TABLE = 'private_keys';

type PrivateKeyErrorCode = 'not_found' | 'invalid' | 'creation_failed';
export class PrivateKeyError extends Error {
    public code: PrivateKeyErrorCode;
    public payload?: Record<string, unknown>;
    constructor({ code, message, payload }: { code: PrivateKeyErrorCode; message: string; payload?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.payload = payload || {};
    }
}

interface DbPrivateKey {
    readonly id: number;
    readonly display_name: string;
    readonly account_id: number;
    readonly environment_id: number;
    readonly encrypted: Buffer | null;
    readonly hash: string;
    readonly created_at: Date;
    readonly expires_at: Date | null;
    readonly last_access_at: Date | null;
    readonly entity_type: EntityType;
    readonly entity_id: number;
}
type DbInsertPrivateKey = Omit<DbPrivateKey, 'id' | 'created_at' | 'last_access_at'>;

const PrivateKeyMapper = {
    to: (key: PrivateKey): DbPrivateKey => {
        return {
            id: key.id,
            display_name: key.displayName,
            account_id: key.accountId,
            environment_id: key.environmentId,
            encrypted: key.encrypted,
            hash: key.hash,
            created_at: key.createdAt,
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
            accountId: dbKey.account_id,
            environmentId: dbKey.environment_id,
            encrypted: dbKey.encrypted,
            hash: dbKey.hash,
            createdAt: dbKey.created_at,
            expiresAt: dbKey.expires_at,
            lastAccessAt: dbKey.last_access_at,
            entityType: dbKey.entity_type,
            entityId: dbKey.entity_id
        };
    }
};

export async function createPrivateKey(
    db: knex.Knex,
    {
        displayName,
        entityType,
        entityId,
        accountId,
        environmentId,
        ttlInMs
    }: Pick<PrivateKey, 'displayName' | 'entityType' | 'entityId' | 'accountId' | 'environmentId'> & { ttlInMs?: number },
    options: { onlyStoreHash: boolean } = { onlyStoreHash: false }
): Promise<Result<[string, PrivateKey], PrivateKeyError>> {
    const now = new Date();
    const random = crypto.randomBytes(32).toString('hex');
    const keyValue = `nango_${entityType}_${random}`;
    const hash = await hashValue(keyValue);
    const key: DbInsertPrivateKey = {
        display_name: displayName,
        account_id: accountId,
        environment_id: environmentId,
        encrypted: options.onlyStoreHash ? null : encryptValue(keyValue),
        hash,
        expires_at: ttlInMs ? new Date(now.getTime() + ttlInMs) : null,
        entity_type: entityType,
        entity_id: entityId
    };
    const [dbKey] = await db.into(PRIVATE_KEYS_TABLE).insert(key).returning('*');
    if (!dbKey) {
        return Err(new PrivateKeyError({ code: 'creation_failed', message: 'Failed to create private key' }));
    }
    return Ok([keyValue, PrivateKeyMapper.from(dbKey)]);
}

export async function getPrivateKey(db: knex.Knex, keyValue: string): Promise<Result<PrivateKey, PrivateKeyError>> {
    const now = new Date();
    const hash = await hashValue(keyValue);
    const [key] = await db
        .update({ last_access_at: now })
        .from<DbPrivateKey>(PRIVATE_KEYS_TABLE)
        .where({ hash })
        .andWhere((builder) => builder.whereNull('expires_at').orWhere('expires_at', '>', now))
        .returning('*');
    if (!key) {
        return Err(
            new PrivateKeyError({
                code: 'not_found',
                message: `Private key not found`,
                payload: {
                    keyValue: keyValue.substring(0, 8)
                }
            })
        );
    }
    return Ok(PrivateKeyMapper.from(key));
}

export async function deletePrivateKey(
    db: knex.Knex,
    { keyValue, entityType }: { keyValue: string; entityType: EntityType }
): Promise<Result<void, PrivateKeyError>> {
    const hash = await hashValue(keyValue);
    const [key] = await db.delete().from<DbPrivateKey>(PRIVATE_KEYS_TABLE).where({ hash, entity_type: entityType }).returning('*');
    if (!key) {
        return Err(new PrivateKeyError({ code: 'not_found', message: `Private key not found` }));
    }
    return Ok(undefined);
}

export function decryptPrivateKey(key: PrivateKey): Result<string | null, PrivateKeyError> {
    return key.encrypted ? decryptValue(key.encrypted) : Ok(null);
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

export async function deleteExpiredPrivateKeys(db: knex.Knex, { limit, olderThan }: { limit: number; olderThan: number }): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - olderThan);

    return await db
        .from<DbPrivateKey>(PRIVATE_KEYS_TABLE)
        .whereIn('id', function (sub) {
            sub.select('id').from<DbPrivateKey>(PRIVATE_KEYS_TABLE).where('expires_at', '<=', dateThreshold.toISOString()).limit(limit);
        })
        .delete();
}
