import * as uuid from 'uuid';
import db from '../db/database.js';
import encryptionManager, { ENCRYPTION_KEY, pbkdf2 } from '../utils/encryption.manager.js';
import type { Environment } from '../models/Environment.js';
import type { EnvironmentVariable } from '../models/EnvironmentVariable.js';
import type { Account } from '../models/Admin.js';
import { LogActionEnum } from '../models/Activity.js';
import accountService from './account.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { isCloud } from '../utils/utils.js';

const TABLE = '_nango_environments';

interface EnvironmentAccount {
    accountId: number;
    environmentId: number;
    environment: string;
}

type EnvironmentAccountSecrets = Record<string, EnvironmentAccount>;

export const defaultEnvironments = ['prod', 'dev'];
const CACHE_ENABLED = !(process.env['NANGO_CACHE_ENV_KEYS'] === 'false');

class EnvironmentService {
    private environmentAccountSecrets: EnvironmentAccountSecrets = {} as EnvironmentAccountSecrets;

    async cacheSecrets(): Promise<void> {
        if (!CACHE_ENABLED) {
            return;
        }

        const environmentAccounts = await db.knex.select('*').from<Environment>(TABLE);

        const environmentAccountSecrets: EnvironmentAccountSecrets = {};

        for (const environmentAccount of environmentAccounts) {
            const decryptedEnvironmentAccount = encryptionManager.decryptEnvironment(environmentAccount);

            if (decryptedEnvironmentAccount != null) {
                environmentAccountSecrets[decryptedEnvironmentAccount.secret_key] = {
                    accountId: decryptedEnvironmentAccount.account_id,
                    environmentId: decryptedEnvironmentAccount.id,
                    environment: decryptedEnvironmentAccount.name
                };
            }
        }

        this.environmentAccountSecrets = environmentAccountSecrets;
    }

    private addToEnvironmentSecretCache(accountEnvironment: Environment) {
        if (!CACHE_ENABLED) {
            return;
        }

        this.environmentAccountSecrets[accountEnvironment.secret_key] = {
            accountId: accountEnvironment.account_id,
            environmentId: accountEnvironment.id,
            environment: accountEnvironment.name
        };
    }

    async getEnvironmentsByAccountId(account_id: number): Promise<Environment[]> {
        try {
            const result = await db.knex.select('name').from<Environment>(TABLE).where({ account_id });

            if (result == null || result.length == 0) {
                return [];
            }

            return result;
        } catch (e) {
            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: account_id
            });

            return [];
        }
    }

    async getAccountIdAndEnvironmentIdBySecretKey(secretKey: string): Promise<{ accountId: number; environmentId: number } | null> {
        if (!isCloud()) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_SECRET_KEY_')) || [];
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envSecretKey = process.env[environmentVariable] as string;

                    if (envSecretKey === secretKey) {
                        const env = environmentVariable.replace('NANGO_SECRET_KEY_', '').toLowerCase();
                        // This key is set dynamically and does not exists in database
                        const environment = await db.knex.select('*').from<Environment>(TABLE).where({ name: env }).first();

                        if (!environment) {
                            return null;
                        }

                        return { accountId: environment.account_id, environmentId: environment.id };
                    }
                }
            }
        }

        if (!this.environmentAccountSecrets[secretKey]) {
            // If the secret key is not in the cache, try to get it from the database
            const hashed = await hashSecretKey(secretKey);
            const fromDb = await db.knex.select('*').from<Environment>(TABLE).where({ secret_key_hashed: hashed }).first();
            if (!fromDb) {
                return null;
            }
            if (!CACHE_ENABLED) {
                return { accountId: fromDb.account_id, environmentId: fromDb.id };
            }
            this.addToEnvironmentSecretCache(fromDb);
        }

        const { accountId, environmentId } = this.environmentAccountSecrets[secretKey] as EnvironmentAccount;

        return accountId != null && environmentId != null ? { accountId, environmentId } : null;
    }

    async getAccountIdFromEnvironment(environment_id: number): Promise<number | null> {
        const result = await db.knex.select('account_id').from<Environment>(TABLE).where({ id: environment_id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].account_id;
    }

    async getAccountUUIDFromEnvironment(environment_id: number): Promise<string | null> {
        const result = await db.knex.select('account_id').from<Environment>(TABLE).where({ id: environment_id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        const accountId = result[0].account_id;

        const uuid = await accountService.getUUIDFromAccountId(accountId);

        return uuid;
    }

    async getAccountUUIDFromEnvironmentUUID(environment_uuid: string): Promise<string | null> {
        const result = await db.knex.select('account_id').from<Environment>(TABLE).where({ uuid: environment_uuid });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        const accountId = result[0].account_id;

        const uuid = await accountService.getUUIDFromAccountId(accountId);

        return uuid;
    }

    async getAccountIdAndEnvironmentIdByPublicKey(publicKey: string): Promise<{ accountId: number; environmentId: number } | null> {
        if (!isCloud()) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_PUBLIC_KEY_')) || [];
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envPublicKey = process.env[environmentVariable] as string;

                    if (envPublicKey === publicKey) {
                        const env = environmentVariable.replace('NANGO_PUBLIC_KEY_', '').toLowerCase();
                        // This key is set dynamically and does not exists in database
                        const environment = await db.knex.select('*').from<Environment>(TABLE).where({ name: env }).first();

                        if (!environment) {
                            return null;
                        }

                        return { accountId: environment.account_id, environmentId: environment.id };
                    }
                }
            }
        }

        const result = await db.knex.select('*').from<Environment>(TABLE).where({ public_key: publicKey }).first();

        if (!result) {
            return null;
        }

        return { accountId: result.account_id, environmentId: result.id };
    }

    async getAccountAndEnvironmentById(account_id: number, environment: string): Promise<{ account: Account | null; environment: Environment | null }> {
        const account = await db.knex.select('*').from<Account>(`_nango_accounts`).where({ id: account_id });

        if (account == null || account.length == 0 || account[0] == null) {
            return { account: null, environment: null };
        }

        const environmentResult = await db.knex.select('*').from<Environment>(TABLE).where({ account_id, name: environment });

        if (environmentResult == null || environmentResult.length == 0 || environmentResult[0] == null) {
            return { account: null, environment: null };
        }

        return { account: account[0], environment: encryptionManager.decryptEnvironment(environmentResult[0]) };
    }

    async getIdByUuid(uuid: string): Promise<number | null> {
        const result = await db.knex.select('id').from<Environment>(TABLE).where({ uuid });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].id;
    }

    async getById(id: number): Promise<Environment | null> {
        try {
            const result = await db.knex.select('*').from<Environment>(TABLE).where({ id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return encryptionManager.decryptEnvironment(result[0]);
        } catch (e) {
            await errorManager.report(e, {
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

    async getRawById(id: number): Promise<Environment | null> {
        try {
            const result = await db.knex.select('*').from<Environment>(TABLE).where({ id });

            if (result == null || result.length == 0 || result[0] == null) {
                return null;
            }

            return result[0];
        } catch (e) {
            await errorManager.report(e, {
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

    async getByEnvironmentName(accountId: number, name: string): Promise<Environment | null> {
        const result = await db.knex.select('*').from<Environment>(TABLE).where({ account_id: accountId, name });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptEnvironment(result[0]);
    }

    async createEnvironment(accountId: number, environment: string): Promise<Environment | null> {
        const result = await db.knex.from<Environment>(TABLE).insert({ account_id: accountId, name: environment }).returning('id');

        if (Array.isArray(result) && result.length === 1 && result[0] && 'id' in result[0]) {
            const environmentId = result[0]['id'];
            const environment = await this.getById(environmentId);
            if (!environment) {
                return null;
            }

            const encryptedEnvironment = encryptionManager.encryptEnvironment(environment);
            await db.knex
                .from<Environment>(TABLE)
                .where({ id: environmentId })
                .update({ ...encryptedEnvironment, secret_key_hashed: await hashSecretKey(environment.secret_key) });
            this.addToEnvironmentSecretCache(environment);
            return encryptedEnvironment;
        }

        return null;
    }

    async createDefaultEnvironments(accountId: number): Promise<void> {
        for (const environment of defaultEnvironments) {
            await this.createEnvironment(accountId, environment);
        }
    }

    async getEnvironmentName(id: number): Promise<string | null> {
        const result = await db.knex.select('name').from<Environment>(TABLE).where({ id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].name;
    }

    /**
     * Get Environment Id For Account Assuming Prod
     * @desc legacy function to get the environment id for an account assuming prod
     * while the transition is being made from account_id to environment_id
     */
    async getEnvironmentIdForAccountAssumingProd(accountId: number): Promise<number | null> {
        const result = await db.knex.select('id').from<Environment>(TABLE).where({ account_id: accountId, name: 'prod' });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].id;
    }

    async editCallbackUrl(callbackUrl: string, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ callback_url: callbackUrl }, ['id']);
    }

    async editWebhookUrl(webhookUrl: string, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ webhook_url: webhookUrl }, ['id']);
    }

    async editHmacEnabled(hmacEnabled: boolean, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ hmac_enabled: hmacEnabled }, ['id']);
    }

    async editAlwaysSendWebhook(always_send_webhook: boolean, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ always_send_webhook }, ['id']);
    }

    async editSendAuthWebhook(send_auth_webhook: boolean, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ send_auth_webhook }, ['id']);
    }

    async editSlackNotifications(slack_notifications: boolean, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ slack_notifications }, ['id']);
    }

    async getSlackNotificationsEnabled(environmentId: number): Promise<boolean | null> {
        const result = await db.knex.select('slack_notifications').from<Environment>(TABLE).where({ id: environmentId });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].slack_notifications;
    }

    async editHmacKey(hmacKey: string, id: number): Promise<Environment | null> {
        return db.knex.from<Environment>(TABLE).where({ id }).update({ hmac_key: hmacKey }, ['id']);
    }

    async getEnvironmentVariables(environment_id: number): Promise<EnvironmentVariable[] | null> {
        const result = await db.knex.select('*').from<EnvironmentVariable>(`_nango_environment_variables`).where({ environment_id });

        if (result === null || result.length === 0) {
            return [];
        }

        return encryptionManager.decryptEnvironmentVariables(result);
    }

    async editEnvironmentVariable(environment_id: number, values: { name: string; value: string }[]): Promise<number[] | null> {
        await db.knex.from<EnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).del();

        if (values.length === 0) {
            return null;
        }

        const mappedValues: EnvironmentVariable[] = values.map((value) => {
            return {
                ...value,
                environment_id
            };
        });

        const encryptedValues = encryptionManager.encryptEnvironmentVariables(mappedValues);

        const results = await db.knex.from<EnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).insert(encryptedValues);

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

        await db.knex.from<Environment>(TABLE).where({ id }).update({ pending_secret_key });

        environment.pending_secret_key = pending_secret_key;

        const encryptedEnvironment = encryptionManager.encryptEnvironment(environment);
        await db.knex.from<Environment>(TABLE).where({ id }).update(encryptedEnvironment);

        return pending_secret_key;
    }

    async rotatePublicKey(id: number): Promise<string | null> {
        const pending_public_key = uuid.v4();

        await db.knex.from<Environment>(TABLE).where({ id }).update({ pending_public_key });

        return pending_public_key;
    }

    async revertSecretKey(id: number): Promise<string | null> {
        const environment = await this.getById(id);

        if (!environment) {
            return null;
        }

        await db.knex.from<Environment>(TABLE).where({ id }).update({
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

        await db.knex.from<Environment>(TABLE).where({ id }).update({ pending_public_key: null });

        return environment.public_key;
    }

    async activateSecretKey(id: number): Promise<boolean> {
        const environment = await this.getRawById(id);

        if (!environment) {
            return false;
        }

        await db.knex
            .from<Environment>(TABLE)
            .where({ id })
            .update({
                secret_key: environment.pending_secret_key as string,
                secret_key_iv: environment.pending_secret_key_iv as string,
                secret_key_tag: environment.pending_secret_key_tag as string,
                secret_key_hashed: await hashSecretKey(environment.pending_public_key!),
                pending_secret_key: null,
                pending_secret_key_iv: null,
                pending_secret_key_tag: null
            });

        if (this.environmentAccountSecrets[environment.secret_key]) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.environmentAccountSecrets[environment.secret_key];
        }

        const updatedEnvironment = await this.getById(id);

        if (!updatedEnvironment) {
            return false;
        }

        this.addToEnvironmentSecretCache(updatedEnvironment);

        return true;
    }

    async activatePublicKey(id: number): Promise<boolean> {
        const environment = await this.getById(id);

        if (!environment) {
            return false;
        }

        await db.knex
            .from<Environment>(TABLE)
            .where({ id })
            .update({
                public_key: environment.pending_public_key as string,
                pending_public_key: null
            });

        return true;
    }
}

export async function hashSecretKey(key: string) {
    if (!ENCRYPTION_KEY) {
        return key;
    }

    return (await pbkdf2(key, ENCRYPTION_KEY, 310000, 32, 'sha256')).toString('base64');
}

export default new EnvironmentService();
