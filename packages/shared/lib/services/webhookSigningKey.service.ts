import * as uuid from 'uuid';

import { Err, Ok } from '@nangohq/utils';

import { getEncryptionManager } from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';

import type { EncryptionManager } from '../utils/encryption.manager.js';
import type { DBCustomerKey, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const WEBHOOK_SIGNING_KEYS_TABLE = 'webhook_signing_keys';
const webhookSigningKeyCache = new Map<number, { key: string; committedAt: number; expiresAt: number }>();
const WEBHOOK_SIGNING_KEY_CACHE_TTL_MS = 300_000;

export type WebhookSigningKeyErrorCode = 'no_webhook_signing_key' | 'multiple_webhook_signing_keys';

export class WebhookSigningKeyError extends Error {
    constructor(
        public readonly code: WebhookSigningKeyErrorCode,
        public readonly payload: Record<string, unknown> = {}
    ) {
        super(code);
    }
}

export async function createWebhookSigningKey(
    trx: Knex,
    {
        environmentId
    }: {
        accountId: number;
        environmentId: number;
    }
): Promise<Result<void>> {
    try {
        const plainText = uuid.v4();
        const encrypted = getEncryptionManager().encryptAPISecret({ secret: plainText, iv: '', tag: '' } as Parameters<
            EncryptionManager['encryptAPISecret']
        >[0]);
        const { rows } = await trx.raw<{ rows: { ts: Date }[] }>('SELECT clock_timestamp() AS ts');
        const stampedAt = rows[0]?.ts;
        if (!stampedAt) {
            throw new NangoError('impossible_condition');
        }
        await upsertWebhookSigningKey(trx, environmentId, encrypted, stampedAt);
        return Ok();
    } catch (err) {
        return Err(err);
    }
}

function cacheWebhookSigningKey(envId: number, key: string, updatedAt: Date): string {
    const existing = webhookSigningKeyCache.get(envId);
    const committedAt = updatedAt.getTime();
    if (existing && existing.expiresAt > Date.now() && existing.committedAt > committedAt) {
        return existing.key;
    }

    webhookSigningKeyCache.set(envId, { key, committedAt, expiresAt: Date.now() + WEBHOOK_SIGNING_KEY_CACHE_TTL_MS });
    return key;
}

async function upsertWebhookSigningKey(
    trx: Knex,
    environmentId: number,
    encrypted: { secret: string; iv: string; tag: string },
    updatedAt: Date
): Promise<void> {
    await trx.raw(
        `INSERT INTO ${WEBHOOK_SIGNING_KEYS_TABLE} (environment_id, secret, iv, tag, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (environment_id) DO UPDATE
             SET secret = EXCLUDED.secret,
                 iv = EXCLUDED.iv,
                 tag = EXCLUDED.tag,
                 updated_at = EXCLUDED.updated_at
             WHERE ${WEBHOOK_SIGNING_KEYS_TABLE}.updated_at < EXCLUDED.updated_at`,
        [environmentId, encrypted.secret, encrypted.iv, encrypted.tag, updatedAt, updatedAt]
    );
}

async function readWebhookSigningKey(trx: Knex, envId: number): Promise<{ key: string; updatedAt: Date }> {
    const row = await trx(WEBHOOK_SIGNING_KEYS_TABLE).select('secret', 'iv', 'tag', 'updated_at').where({ environment_id: envId }).first();
    if (!row) {
        throw new NangoError('no_webhook_signing_key', { environment_id: envId });
    }

    const decrypted = getEncryptionManager().decryptAPISecret(row as Parameters<EncryptionManager['decryptAPISecret']>[0]) as DBCustomerKey;
    return { key: decrypted.secret, updatedAt: new Date(row.updated_at) };
}

export async function getWebhookSigningKeyForEnv(trx: Knex, envId: number): Promise<Result<string>> {
    const cached = webhookSigningKeyCache.get(envId);
    if (cached && cached.expiresAt > Date.now()) {
        return Ok(cached.key);
    }

    try {
        const { key, updatedAt } = await readWebhookSigningKey(trx, envId);
        return Ok(cacheWebhookSigningKey(envId, key, updatedAt));
    } catch (err) {
        return Err(err);
    }
}

export async function getUncachedWebhookSigningKeyForEnv(trx: Knex, envId: number): Promise<Result<string>> {
    try {
        const { key } = await readWebhookSigningKey(trx, envId);
        return Ok(key);
    } catch (err) {
        return Err(err);
    }
}

/**
 * Replaces the environment's webhook signing key with a fresh one and returns it in plain text.
 * Callers in other processes keep signing with the previous key until their cache entry expires.
 */
export async function rotateWebhookSigningKey(trx: Knex, envId: number): Promise<Result<string>> {
    try {
        const plainText = uuid.v4();
        const encrypted = getEncryptionManager().encryptAPISecret({ secret: plainText, iv: '', tag: '' } as Parameters<
            EncryptionManager['encryptAPISecret']
        >[0]);

        const committed = await trx.transaction(async (innerTrx) => {
            const { rows } = await innerTrx.raw<{ rows: { ts: Date }[] }>('SELECT clock_timestamp() AS ts');
            const stampedAt = rows[0]?.ts;
            if (!stampedAt) {
                throw new NangoError('impossible_condition');
            }

            const current = await innerTrx(WEBHOOK_SIGNING_KEYS_TABLE).where({ environment_id: envId }).first();
            if (!current) {
                throw new WebhookSigningKeyError('no_webhook_signing_key', { environmentId: envId });
            }

            await upsertWebhookSigningKey(innerTrx, envId, encrypted, stampedAt);
            return readWebhookSigningKey(innerTrx, envId);
        });

        cacheWebhookSigningKey(envId, committed.key, committed.updatedAt);
        return Ok(committed.key);
    } catch (err) {
        return Err(err);
    }
}
