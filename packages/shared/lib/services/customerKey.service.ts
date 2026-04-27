import * as uuid from 'uuid';

import { Err, Ok, stringToHash } from '@nangohq/utils';

import encryptionManager, { pbkdf2 } from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';

import type { DBCustomerKey, DBCustomerKeyRelation, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const CUSTOMER_KEYS_TABLE = 'customer_keys';
const CUSTOMER_KEYS_RELATIONS_TABLE = 'customer_keys_relations';
// Cache decrypted webhook signing key per environment. No eviction needed since rotation is not supported yet.
const webhookSigningKeyCache = new Map<number, string>();
// Internal safety limit — not a product constraint, just prevents unbounded key creation.
// Can be raised without migration if needed.
export const MAX_API_KEYS_PER_ENV = 50;

class CustomerKeyService {
    private async acquireNameLock(trx: Knex, accountId: number, keyType: string): Promise<void> {
        const lockKey = stringToHash(`customer_key_name:${accountId}:${keyType}`);
        await trx.raw(`SELECT pg_advisory_xact_lock(?) as "lock_customer_key_name_${keyType}"`, [lockKey]);
    }
    public async createApiKey(
        trx: Knex,
        {
            accountId,
            environmentId,
            displayName,
            scopes = ['environment:*']
        }: {
            accountId: number;
            environmentId: number;
            displayName: string;
            scopes?: string[];
        }
    ): Promise<Result<DBCustomerKey>> {
        try {
            const plainText = uuid.v4();

            const hashed = await this.hashSecret(plainText);
            if (hashed.isErr()) {
                throw hashed.error;
            }

            const created = await trx.transaction(async (innerTrx) => {
                await this.acquireNameLock(innerTrx, accountId, 'api');

                // Check name uniqueness within the environment
                const existing = await innerTrx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                    .select(`${CUSTOMER_KEYS_TABLE}.id`)
                    .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                    .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                    .where(`${CUSTOMER_KEYS_TABLE}.display_name`, displayName)
                    .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type`, 'environment')
                    .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`, environmentId)
                    .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                    .first();

                if (existing) {
                    throw new NangoError('duplicate_api_key', { display_name: displayName });
                }

                // Check max keys per environment
                const count = await innerTrx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                    .join(CUSTOMER_KEYS_RELATIONS_TABLE, `${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id`, `${CUSTOMER_KEYS_TABLE}.id`)
                    .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                    .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type`, 'environment')
                    .where(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id`, environmentId)
                    .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                    .count('* as total')
                    .first();
                if (count && Number(count['total']) >= MAX_API_KEYS_PER_ENV) {
                    throw new NangoError('resource_capped', { max: MAX_API_KEYS_PER_ENV });
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

                const encrypted = encryptionManager.encryptAPISecret(
                    customerKey as Parameters<typeof encryptionManager.encryptAPISecret>[0]
                ) as typeof customerKey;

                const [row] = await innerTrx<DBCustomerKey>(CUSTOMER_KEYS_TABLE).insert(encrypted).returning('*');
                if (!row) {
                    throw new NangoError('impossible_condition');
                }

                await innerTrx<DBCustomerKeyRelation>(CUSTOMER_KEYS_RELATIONS_TABLE).insert({
                    customer_key_id: row.id,
                    entity_type: 'environment',
                    entity_id: environmentId
                });

                return row;
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
            environmentId
        }: {
            accountId: number;
            environmentId: number;
        }
    ): Promise<Result<DBCustomerKey>> {
        try {
            const plainText = uuid.v4();

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
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .orderBy(`${CUSTOMER_KEYS_TABLE}.display_name`, 'asc');

            const decrypted = rows.map(
                (row) => encryptionManager.decryptAPISecret(row as Parameters<typeof encryptionManager.decryptAPISecret>[0]) as DBCustomerKey
            );
            return Ok(decrypted);
        } catch (err) {
            return Err(err);
        }
    }

    public async getWebhookSigningKeyForEnv(trx: Knex, envId: number): Promise<Result<string>> {
        const cached = webhookSigningKeyCache.get(envId);
        if (cached) {
            return Ok(cached);
        }

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
            webhookSigningKeyCache.set(envId, decrypted.secret);
            return Ok(decrypted.secret);
        } catch (err) {
            return Err(err);
        }
    }

    public async renameApiKey(trx: Knex, keyId: number, displayName: string, envId: number, accountId: number): Promise<Result<void>> {
        try {
            await trx.transaction(async (innerTrx) => {
                await this.acquireNameLock(innerTrx, accountId, 'api');

                // Check uniqueness: no other API key in the same environment should have this name
                const existing = await innerTrx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
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
                    throw new NangoError('duplicate_api_key', { display_name: displayName });
                }

                const updated = await innerTrx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                    .where(`${CUSTOMER_KEYS_TABLE}.id`, keyId)
                    .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                    .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                    .whereExists(function () {
                        void this.select(innerTrx.raw('1'))
                            .from(CUSTOMER_KEYS_RELATIONS_TABLE)
                            .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id = ${CUSTOMER_KEYS_TABLE}.id`)
                            .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type = ?`, ['environment'])
                            .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id = ?`, [envId]);
                    })
                    .update({ display_name: displayName, updated_at: innerTrx.fn.now() as unknown as Date });
                if (updated === 0) {
                    throw new NangoError('no_such_api_secret', { id: keyId });
                }
            });
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    public async updateApiKeyScopes(trx: Knex, keyId: number, scopes: string[], envId: number): Promise<Result<void>> {
        try {
            const updated = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where(`${CUSTOMER_KEYS_TABLE}.id`, keyId)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .whereExists(function () {
                    void this.select(trx.raw('1'))
                        .from(CUSTOMER_KEYS_RELATIONS_TABLE)
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id = ${CUSTOMER_KEYS_TABLE}.id`)
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type = ?`, ['environment'])
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id = ?`, [envId]);
                })
                .update({ scopes, updated_at: trx.fn.now() as unknown as Date });
            if (updated === 0) {
                return Err(new NangoError('no_such_api_secret', { id: keyId }));
            }
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    public async deleteCustomerKey(trx: Knex, keyId: number, envId: number): Promise<Result<void>> {
        try {
            const updated = await trx<DBCustomerKey>(CUSTOMER_KEYS_TABLE)
                .where(`${CUSTOMER_KEYS_TABLE}.id`, keyId)
                .where(`${CUSTOMER_KEYS_TABLE}.key_type`, 'api')
                .whereNull(`${CUSTOMER_KEYS_TABLE}.deleted_at`)
                .whereExists(function () {
                    void this.select(trx.raw('1'))
                        .from(CUSTOMER_KEYS_RELATIONS_TABLE)
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.customer_key_id = ${CUSTOMER_KEYS_TABLE}.id`)
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_type = ?`, ['environment'])
                        .whereRaw(`${CUSTOMER_KEYS_RELATIONS_TABLE}.entity_id = ?`, [envId]);
                })
                .update({
                    deleted_at: trx.fn.now() as unknown as Date
                });
            if (updated === 0) {
                return Err(new NangoError('no_such_api_secret', { id: keyId }));
            }
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    private async hashSecret(plainText: string): Promise<Result<string>> {
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
