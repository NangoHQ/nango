import * as uuid from 'uuid';
import db from '@nangohq/database';
import encryptionManager, { pbkdf2 } from '../utils/encryption.manager.js';
import type { DBTeam, DBEnvironmentVariable, DBEnvironment } from '@nangohq/types';
import { LogActionEnum } from '../models/Telemetry.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { isCloud } from '@nangohq/utils';
import { externalWebhookService, getGlobalOAuthCallbackUrl } from '../index.js';

const TABLE = '_nango_environments';

export const defaultEnvironments = ['prod', 'dev'];

const hashLocalCache = new Map<string, string>();

class EnvironmentService {
    async getEnvironmentsByAccountId(account_id: number): Promise<Pick<DBEnvironment, 'name'>[]> {
        try {
            const result = await db.knex.select<Pick<DBEnvironment, 'name'>[]>('name').from<DBEnvironment>(TABLE).where({ account_id });

            if (result == null || result.length == 0) {
                return [];
            }

            return result;
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: account_id
            });

            return [];
        }
    }

    async getAccountAndEnvironmentBySecretKey(secretKey: string): Promise<{ account: DBTeam; environment: DBEnvironment } | null> {
        if (!isCloud) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_SECRET_KEY_'));
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envSecretKey = process.env[environmentVariable] as string;

                    if (envSecretKey !== secretKey) {
                        continue;
                    }

                    const envName = environmentVariable.replace('NANGO_SECRET_KEY_', '').toLowerCase();
                    // This key is set dynamically and does not exist in database
                    const env = await db.knex
                        .select<Pick<DBEnvironment, 'account_id'>>('account_id')
                        .from<DBEnvironment>(TABLE)
                        .where({ name: envName })
                        .first();

                    if (!env) {
                        return null;
                    }

                    return this.getAccountAndEnvironment({ accountId: env.account_id, envName });
                }
            }
        }

        return this.getAccountAndEnvironment({ secretKey });
    }

    async getAccountIdFromEnvironment(environment_id: number): Promise<number | null> {
        const result = await db.knex.select('account_id').from<DBEnvironment>(TABLE).where({ id: environment_id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].account_id;
    }

    async getAccountFromEnvironment(environment_id: number): Promise<DBTeam | null> {
        const result = await db.knex
            .select<DBTeam>('_nango_accounts.*')
            .from(TABLE)
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .where('_nango_environments.id', environment_id)
            .first();

        return result || null;
    }

    async getAccountAndEnvironmentByPublicKey(publicKey: string): Promise<{ account: DBTeam; environment: DBEnvironment } | null> {
        if (!isCloud) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_PUBLIC_KEY_'));
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envPublicKey = process.env[environmentVariable] as string;

                    if (envPublicKey !== publicKey) {
                        continue;
                    }
                    const envName = environmentVariable.replace('NANGO_PUBLIC_KEY_', '').toLowerCase();
                    // This key is set dynamically and does not exist in database
                    const env = await db.knex
                        .select<Pick<DBEnvironment, 'account_id'>>('account_id')
                        .from<DBEnvironment>(TABLE)
                        .where({ name: envName })
                        .first();
                    if (!env) {
                        return null;
                    }

                    return this.getAccountAndEnvironment({ accountId: env.account_id, envName });
                }
            }
        }

        return this.getAccountAndEnvironment({ publicKey });
    }

    async getAccountAndEnvironment(
        // TODO: fix this union type that is not discriminated
        opts:
            | { publicKey: string }
            | { secretKey: string }
            | { accountId: number; envName: string }
            | { environmentId: number }
            | { environmentUuid: string }
            | { accountUuid: string; envName: string }
    ): Promise<{ account: DBTeam; environment: DBEnvironment } | null> {
        const q = db.knex
            .select<{
                account: DBTeam;
                environment: DBEnvironment;
            }>(db.knex.raw('row_to_json(_nango_environments.*) as environment'), db.knex.raw('row_to_json(_nango_accounts.*) as account'))
            .from<DBEnvironment>(TABLE)
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .first();

        let hash: string | undefined;
        if ('secretKey' in opts) {
            // Hashing is slow by design so it's very slow to recompute this hash all the time
            // We keep the hash in-memory to not compromise on security if the db leak
            hash = hashLocalCache.get(opts.secretKey) || (await hashSecretKey(opts.secretKey));
            q.where('secret_key_hashed', hash);
        } else if ('publicKey' in opts) {
            q.where('_nango_environments.public_key', opts.publicKey);
        } else if ('environmentUuid' in opts) {
            q.where('_nango_environments.uuid', opts.environmentUuid);
        } else if ('accountUuid' in opts) {
            q.where('_nango_accounts.uuid', opts.accountUuid).where('_nango_environments.name', opts.envName);
        } else if ('accountId' in opts) {
            q.where('_nango_environments.account_id', opts.accountId).where('_nango_environments.name', opts.envName);
        } else if ('environmentId' in opts) {
            q.where('_nango_environments.id', opts.environmentId);
        } else {
            return null;
        }

        const res = await q;
        if (!res) {
            return null;
        }

        if (hash && 'secretKey' in opts) {
            // Store only successful attempt to not pollute the memory
            hashLocalCache.set(opts.secretKey, hash);
        }
        return {
            // Getting data with row_to_json breaks the automatic string to date parser
            account: { ...res.account, created_at: new Date(res.account.created_at), updated_at: new Date(res.account.updated_at) },
            environment: encryptionManager.decryptEnvironment(res.environment)
        };
    }

    async getById(id: number): Promise<DBEnvironment | null> {
        try {
            const result = await db.knex.select('*').from<DBEnvironment>(TABLE).where({ id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return encryptionManager.decryptEnvironment(result[0]);
        } catch (err) {
            errorManager.report(err, {
                environmentId: id,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                metadata: {
                    id
                }
            });
            return null;
        }
    }

    async getRawById(id: number): Promise<DBEnvironment | null> {
        try {
            const result = await db.knex.select('*').from<DBEnvironment>(TABLE).where({ id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return result[0];
        } catch (err) {
            errorManager.report(err, {
                environmentId: id,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                metadata: {
                    id
                }
            });
            return null;
        }
    }

    async getByEnvironmentName(accountId: number, name: string): Promise<DBEnvironment | null> {
        const result = await db.knex.select('*').from<DBEnvironment>(TABLE).where({ account_id: accountId, name });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptEnvironment(result[0]);
    }

    async createEnvironment(accountId: number, name: string): Promise<DBEnvironment | null> {
        const [environment] = await db.knex.from<DBEnvironment>(TABLE).insert({ account_id: accountId, name }).returning('*');

        if (!environment) {
            return null;
        }

        const encryptedEnvironment = await encryptionManager.encryptEnvironment({
            ...environment,
            secret_key_hashed: await hashSecretKey(environment.secret_key)
        });
        await db.knex.from<DBEnvironment>(TABLE).where({ id: environment.id }).update(encryptedEnvironment);

        const env = encryptionManager.decryptEnvironment(encryptedEnvironment);
        return env;
    }

    async createDefaultEnvironments(accountId: number): Promise<void> {
        for (const environment of defaultEnvironments) {
            const newEnv = await this.createEnvironment(accountId, environment);
            if (newEnv) {
                await externalWebhookService.update(newEnv.id, {
                    alwaysSendWebhook: true,
                    sendAuthWebhook: true,
                    sendRefreshFailedWebhook: true,
                    sendSyncFailedWebhook: true
                });
            }
        }
    }

    async getEnvironmentsWithOtlpSettings(): Promise<DBEnvironment[]> {
        const result = await db.knex.select('*').from<DBEnvironment>(TABLE).whereNotNull('otlp_settings');
        if (result == null) {
            return [];
        }
        return result.map((env) => encryptionManager.decryptEnvironment(env));
    }

    async editCallbackUrl(callbackUrl: string, id: number): Promise<DBEnvironment | null> {
        return db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ callback_url: callbackUrl }, ['id']);
    }

    async editHmacEnabled(hmacEnabled: boolean, id: number): Promise<DBEnvironment | null> {
        return db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ hmac_enabled: hmacEnabled }, ['id']);
    }

    async editSlackNotifications(slack_notifications: boolean, id: number): Promise<DBEnvironment | null> {
        return db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ slack_notifications }, ['id']);
    }

    async getSlackNotificationsEnabled(environmentId: number): Promise<boolean | null> {
        const result = await db.knex.select('slack_notifications').from<DBEnvironment>(TABLE).where({ id: environmentId });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].slack_notifications;
    }

    async editHmacKey(hmacKey: string, id: number): Promise<DBEnvironment | null> {
        return db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ hmac_key: hmacKey }, ['id']);
    }

    async editOtlpSettings(environmentId: number, otlpSettings: { endpoint: string; headers: Record<string, string> } | null): Promise<DBEnvironment | null> {
        return db.knex.from<DBEnvironment>(TABLE).where({ id: environmentId }).update({ otlp_settings: otlpSettings }, ['id']);
    }

    async getEnvironmentVariables(environment_id: number): Promise<DBEnvironmentVariable[] | null> {
        const result = await db.knex.select('*').from<DBEnvironmentVariable>(`_nango_environment_variables`).where({ environment_id });

        if (result === null || result.length === 0) {
            return [];
        }

        return encryptionManager.decryptEnvironmentVariables(result);
    }

    async editEnvironmentVariable(environment_id: number, values: { name: string; value: string }[]): Promise<number[] | null> {
        await db.knex.from<DBEnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).del();

        if (values.length === 0) {
            return null;
        }

        const mappedValues: DBEnvironmentVariable[] = values.map((value) => {
            return {
                ...value,
                created_at: new Date(),
                updated_at: new Date(),
                environment_id
            };
        });

        const encryptedValues = encryptionManager.encryptEnvironmentVariables(mappedValues);

        const results = await db.knex.from<DBEnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).insert(encryptedValues);

        if (results === null || results.length === 0) {
            return null;
        }

        return results;
    }

    async rotateKey(id: number, type: string): Promise<string | null> {
        if (type === 'secret') {
            return this.rotateSecretKey(id);
        }

        if (type === 'public') {
            return this.rotatePublicKey(id);
        }

        return null;
    }

    async revertKey(id: number, type: string): Promise<string | null> {
        if (type === 'secret') {
            return this.revertSecretKey(id);
        }

        if (type === 'public') {
            return this.revertPublicKey(id);
        }

        return null;
    }

    async activateKey(id: number, type: string): Promise<boolean> {
        if (type === 'secret') {
            return this.activateSecretKey(id);
        }

        if (type === 'public') {
            return this.activatePublicKey(id);
        }

        return false;
    }

    async rotateSecretKey(id: number): Promise<string | null> {
        const environment = await this.getById(id);

        if (!environment) {
            return null;
        }

        const pending_secret_key = uuid.v4();

        await db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ pending_secret_key });

        environment.pending_secret_key = pending_secret_key;

        const encryptedEnvironment = await encryptionManager.encryptEnvironment(environment);
        await db.knex.from<DBEnvironment>(TABLE).where({ id }).update(encryptedEnvironment);

        return pending_secret_key;
    }

    async rotatePublicKey(id: number): Promise<string | null> {
        const pending_public_key = uuid.v4();

        await db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ pending_public_key });

        return pending_public_key;
    }

    async revertSecretKey(id: number): Promise<string | null> {
        const environment = await this.getById(id);

        if (!environment) {
            return null;
        }

        await db.knex.from<DBEnvironment>(TABLE).where({ id }).update({
            pending_secret_key: null,
            pending_secret_key_iv: null,
            pending_secret_key_tag: null
        });

        return environment.secret_key;
    }

    async revertPublicKey(id: number): Promise<string | null> {
        const environment = await this.getById(id);

        if (!environment) {
            return null;
        }

        await db.knex.from<DBEnvironment>(TABLE).where({ id }).update({ pending_public_key: null });

        return environment.public_key;
    }

    async activateSecretKey(id: number): Promise<boolean> {
        const environment = await this.getRawById(id);
        if (!environment) {
            return false;
        }

        const decrypted = encryptionManager.decryptEnvironment(environment);
        await db.knex
            .from<DBEnvironment>(TABLE)
            .where({ id })
            .update({
                secret_key: environment.pending_secret_key as string,
                secret_key_iv: environment.pending_secret_key_iv as string,
                secret_key_tag: environment.pending_secret_key_tag as string,
                secret_key_hashed: await hashSecretKey(decrypted.pending_secret_key!),
                pending_secret_key: null,
                pending_secret_key_iv: null,
                pending_secret_key_tag: null
            });

        const updatedEnvironment = await this.getById(id);

        if (!updatedEnvironment) {
            return false;
        }

        return true;
    }

    async activatePublicKey(id: number): Promise<boolean> {
        const environment = await this.getById(id);

        if (!environment) {
            return false;
        }

        await db.knex
            .from<DBEnvironment>(TABLE)
            .where({ id })
            .update({
                public_key: environment.pending_public_key as string,
                pending_public_key: null
            });

        return true;
    }

    async getOauthCallbackUrl(environmentId?: number) {
        const globalCallbackUrl = getGlobalOAuthCallbackUrl();

        if (environmentId != null) {
            const environment: DBEnvironment | null = await this.getById(environmentId);
            return environment?.callback_url || globalCallbackUrl;
        }

        return globalCallbackUrl;
    }
}

export async function hashSecretKey(key: string) {
    if (!encryptionManager.getKey()) {
        return key;
    }

    return (await pbkdf2(key, encryptionManager.getKey(), 310000, 32, 'sha256')).toString('base64');
}

export default new EnvironmentService();
