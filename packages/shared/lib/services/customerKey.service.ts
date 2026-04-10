import * as uuid from 'uuid';

import { Err, Ok } from '@nangohq/utils';

import encryptionManager, { pbkdf2 } from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';

import type { DBCustomerKey, DBCustomerKeyRelation, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const CUSTOMER_KEYS_TABLE = 'customer_keys';
const CUSTOMER_KEYS_RELATIONS_TABLE = 'customer_keys_relations';

// Advisory lock namespace for customer key name uniqueness.
// Uses (account_id, key_type_hash) to avoid contention across accounts/key types.
const KEY_TYPE_LOCK_IDS: Record<string, number> = { api: 1, webhook_signing: 2 };

class CustomerKeyService {
    private async acquireNameLock(trx: Knex, accountId: number, keyType: string): Promise<void> {
        const lockId = KEY_TYPE_LOCK_IDS[keyType] ?? 0;
        await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [accountId, lockId]);
    }
    public async createApiKey(
        trx: Knex,
        {
            accountId,
            environmentId,
            displayName,
            scopes = ['environment:*'],
            secret: providedSecret
        }: {
            accountId: number;
            environmentId: number;
            displayName: string;
            scopes?: string[];
            secret?: string;
        }
    ): Promise<Result<DBCustomerKey>> {
        try {
            await this.acquireNameLock(trx, accountId, 'api');

            const plainText = providedSecret ?? uuid.v4();

            const hashed = await this.hashSecret(plainText);
            if (hashed.isErr()) {
                throw hashed.error;
            }

            const customerKey = {
                account_id: accountId,
                key_type: 'api' as const,
                display_name: displayName,
                scopes,
                secret: plainText,
                iv: '',
                tag: '',
                hashed: hashed.value,
                last_used_at: null,
                deleted_at: null
            } satisfies Partial<DBCustomerKey>;

            const encrypted = encryptionManager.encryptAPISecret(customerKey as Parameters<typeof encryptionManager.encryptAPISecret>[0]) as typeof customerKey;

            const [created] = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE).insert(encrypted).returning('*');
            if (!created) {
                throw new NangoError('impossible_condition');
            }

            await trx<DBCustomerKeyRelation>(CUSTOMER_KEYS_RELATIONS_TABLE).insert({
                customer_key_id: created.id,
                entity_type: 'environment',
                entity_id: environmentId
            });

            created.secret = plainText; // Callers expect unencrypted secret.
            return Ok(created);
        } catch (err) {
            return Err(err);
        }
    }

    public async createWebhookSigningKey(
        trx: Knex,
        {
            accountId,
            environmentId,
            secret: providedSecret
        }: {
            accountId: number;
            environmentId: number;
            secret?: string;
        }
    ): Promise<Result<DBCustomerKey>> {
        try {
            const plainText = providedSecret ?? uuid.v4();

            const hashed = await this.hashSecret(plainText);
            if (hashed.isErr()) {
                throw hashed.error;
            }

            const customerKey = {
                account_id: accountId,
                key_type: 'webhook_signing' as const,
                display_name: 'Webhook signing',
                scopes: null,
                secret: plainText,
                iv: '',
                tag: '',
                hashed: hashed.value,
                last_used_at: null,
                deleted_at: null
            } satisfies Partial<DBCustomerKey>;

            const encrypted = encryptionManager.encryptAPISecret(customerKey as Parameters<typeof encryptionManager.encryptAPISecret>[0]) as typeof customerKey;

            const [created] = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE).insert(encrypted).returning('*');
            if (!created) {
                throw new NangoError('impossible_condition');
            }

            await trx<DBCustomerKeyRelation>(CUSTOMER_KEYS_RELATIONS_TABLE).insert({
                customer_key_id: created.id,
                entity_type: 'environment',
                entity_id: environmentId
            });

            created.secret = plainText; // Callers expect unencrypted secret.
            return Ok(created);
        } catch (err) {
            return Err(err);
        }
    }

    public async getApiKeysByEnv(trx: Knex, envId: number): Promise<Result<DBCustomerKey[]>> {
        try {
            const rows = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .select(`${CUSTOMER_KEYS_TABLE}.*`)
                .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type`, 'environment')
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`, envId)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`);

            const decrypted = rows.map(
                (row) => encryptionManager.decryptAPISecret(row as Parameters<typeof encryptionManager.decryptAPISecret>[0]) as DBCustomerKey
            );
            return Ok(decrypted);
        } catch (err) {
            return Err(err);
        }
    }

    public async getApiKeyByHash(trx: Knex, hash: string): Promise<Result<(DBCustomerKey & { entity_id: number }) | null>> {
        try {
            const row = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .select(`${CUSTOMER_KEYS_TABLE}.*`, `${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`)
                .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                .where(`${CUSTOMER_KEYS_TABLE}.hashed`, hash)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .first();

            if (!row) {
                return Ok(null);
            }

            const decrypted = encryptionManager.decryptAPISecret(row as Parameters<typeof encryptionManager.decryptAPISecret>[0]) as DBCustomerKey & {
                entity_id: number;
            };
            return Ok(decrypted);
        } catch (err) {
            return Err(err);
        }
    }

    public async getWebhookSigningKeyForEnv(trx: Knex, envId: number): Promise<Result<DBCustomerKey>> {
        try {
            const row = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .select(`${CUSTOMER_KEYS_TABLE}.*`)
                .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'webhook_signing')
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type`, 'environment')
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`, envId)
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .first();

            if (!row) {
                throw new NangoError('no_webhook_signing_key', { environment_id: envId });
            }

            const decrypted = encryptionManager.decryptAPISecret(row as Parameters<typeof encryptionManager.decryptAPISecret>[0]) as DBCustomerKey;
            return Ok(decrypted);
        } catch (err) {
            return Err(err);
        }
    }

    public async renameApiKey(trx: Knex, keyId: number, displayName: string, envId: number, accountId: number): Promise<Result<void>> {
        try {
            await this.acquireNameLock(trx, accountId, 'api');

            // Check uniqueness: no other API key in the same environment should have this name
            const existing = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .select(`${CUSTOMER_KEYS_TABLE}.id`)
                .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                .where(`${CUSTOMER_KEYS_TABLE}.display_name`, displayName)
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type`, 'environment')
                .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`, envId)
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .whereNot(`${CUSTOMER_KEYS_TABLE}.id`, keyId)
                .first();

            if (existing) {
                return Err(new NangoError('duplicate_api_secret', { display_name: displayName }));
            }

            const updated = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where({ id: keyId })
                .whereNull('deleted_at')
                .update({ display_name: displayName, updated_at: trx.fn.now() as unknown as Date });
            if (updated === 0) {
                return Err(new NangoError('no_such_api_secret', { id: keyId }));
            }
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    public async updateApiKeyScopes(trx: Knex, keyId: number, scopes: string[]): Promise<Result<void>> {
        try {
            const updated = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where({ id: keyId })
                .whereNull('deleted_at')
                .update({ scopes, updated_at: trx.fn.now() as unknown as Date });
            if (updated === 0) {
                return Err(new NangoError('no_such_api_secret', { id: keyId }));
            }
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    public async deleteCustomerKey(trx: Knex, keyId: number): Promise<Result<void>> {
        try {
            await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where({ id: keyId })
                .update({
                    deleted_at: trx.fn.now() as unknown as Date
                });
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    public async updateLastUsedAt(trx: Knex, keyId: number, now: Date): Promise<void> {
        try {
            const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
            await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where({ id: keyId })
                .where(function () {
                    void this.whereNull('last_used_at').orWhere('last_used_at', '<', oneMinuteAgo);
                })
                .update({
                    last_used_at: now
                });
        } catch {
            // Fire-and-forget: swallow errors intentionally.
        }
    }

    public async hashSecret(plainText: string): Promise<Result<string>> {
        try {
            if (!encryptionManager.shouldEncrypt()) {
                return Ok(plainText);
            }
            const key = encryptionManager.getKey();
            const hash = (await pbkdf2(plainText, key, 310000, 32, 'sha256')).toString('base64');
            return Ok(hash);
        } catch (err) {
            return Err(err);
        }
    }
}

export default new CustomerKeyService();
