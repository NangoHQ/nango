import * as uuid from 'uuid';

import encryptionManager, { pbkdf2 } from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';

import type { DBAPISecret } from '@nangohq/types';
import type { Knex } from 'knex';

const API_SECRETS_TABLE = 'api_secrets';

class SecretService {
    public async getDefaultSecretForEnv(trx: Knex, envId: number): Promise<DBAPISecret> {
        const [secret] = await trx<DBAPISecret>(API_SECRETS_TABLE).select('*').where({
            environment_id: envId,
            is_default: true
        });
        if (!secret) {
            // Invariant violation: There is no default secret for this environment.
            // This should never happen. If it somehow does, we roll back the surrounding trx
            // by throwing, and let the exception bubble up the call chain.
            throw new NangoError('no_default_api_secret', { environment_id: envId });
        }
        return encryptionManager.decryptAPISecret(secret); // Callers expect unencrypted secret.
    }

    public async getAllSecretsForEnv(trx: Knex, envId: number): Promise<DBAPISecret[]> {
        const secrets = await trx<DBAPISecret>(API_SECRETS_TABLE).select('*').where({ environment_id: envId });
        return secrets.map((secret) => encryptionManager.decryptAPISecret(secret)); // Callers expect unencrypted secret.
    }

    public async getDefaultSecretsForAllEnvs(trx: Knex, envIds: number[]): Promise<Map<(typeof envIds)[number], DBAPISecret>> {
        const out = new Map<(typeof envIds)[number], DBAPISecret>();
        const rows = await trx<DBAPISecret>(API_SECRETS_TABLE).select('*').where({ is_default: true }).whereIn('environment_id', envIds);
        for (const row of rows) {
            out.set(row.environment_id, encryptionManager.decryptAPISecret(row)); // Callers expect unencrypted secrets.
        }
        if (envIds.length !== out.size) {
            // Invariant violation: One of the given envIds didn't have a default secret.
            // This should never happen. If it somehow does, we roll back the surrounding trx
            // by throwing, and let the exception bubble up the call chain.
            for (const envId of envIds) {
                if (!out.has(envId)) {
                    throw new NangoError('no_default_api_secret', { environment_id: envId });
                }
            }
            throw new NangoError('impossible_condition');
        }
        return out;
    }

    public async getAllSecretsForAllEnvs(trx: Knex, envIds: number[]): Promise<Map<(typeof envIds)[number], DBAPISecret[]>> {
        const out = new Map<(typeof envIds)[number], DBAPISecret[]>();
        const rows = await trx<DBAPISecret>(API_SECRETS_TABLE).select('*').whereIn('environment_id', envIds);
        for (const row of rows) {
            const secrets = out.get(row.environment_id) || [];
            secrets.push(encryptionManager.decryptAPISecret(row)); // Callers expect unencrypted secrets.
            out.set(row.environment_id, secrets);
        }
        return out;
    }

    public async createSecret(
        trx: Knex,
        {
            environmentId,
            displayName,
            isDefault
        }: {
            environmentId: number;
            displayName?: string;
            isDefault: boolean;
        }
    ): Promise<DBAPISecret> {
        const plainText = uuid.v4();

        const secret = {
            environment_id: environmentId,
            display_name: displayName ?? new Date().toISOString(),
            secret: plainText,
            iv: '',
            tag: '',
            hashed: await this.hashSecret(plainText),
            is_default: isDefault
        } satisfies Partial<DBAPISecret>;

        const encrypted = encryptionManager.encryptAPISecret(secret);

        const rows = await trx<DBAPISecret>(API_SECRETS_TABLE).insert(encrypted).returning('*');
        if (!rows || rows.length === 0) {
            // The insert above throws if it fails.
            // But we're defensive: If for any reason it were to fail without throwing, we throw.
            throw new NangoError('impossible_condition');
        }

        const created = rows[0]!;
        created.secret = plainText; // Callers expect unencrypted secret.
        return created;
    }

    public async markDefault(trx: Knex, secretId: number): Promise<void> {
        return trx.transaction(async (trx) => {
            const rows = await trx<DBAPISecret>(API_SECRETS_TABLE).select('environment_id').where({ id: secretId });
            if (!rows || rows.length === 0) {
                throw new NangoError('no_such_api_secret', { id: secretId });
            }
            const secret = rows[0]!;
            await trx<DBAPISecret>(API_SECRETS_TABLE)
                .where({
                    environment_id: secret.environment_id,
                    is_default: true
                })
                .update({
                    is_default: false,
                    updated_at: new Date()
                });
            await trx<DBAPISecret>(API_SECRETS_TABLE)
                .where({
                    id: secretId,
                    environment_id: secret.environment_id,
                    is_default: false
                })
                .update({
                    is_default: true,
                    updated_at: new Date()
                });
        });
    }

    public async hashSecret(plainText: string): Promise<string> {
        if (!encryptionManager.shouldEncrypt()) {
            return plainText;
        }
        const key = encryptionManager.getKey();
        return (await pbkdf2(plainText, key, 310000, 32, 'sha256')).toString('base64');
    }
}

export default new SecretService();
