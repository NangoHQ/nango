import db from '../db/database.js';
import encryptionManager from '../utils/encryption.manager.js';
import type { Environment } from '../models/Environment.js';
import type { EnvironmentVariable } from '../models/EnvironmentVariable.js';
import type { Account } from '../models/Admin.js';
import { LogActionEnum } from '../models/Activity.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';

const TABLE = '_nango_environments';

interface EnvironmentAccount {
    accountId: number;
    environmentId: number;
    environment: string;
}

interface EnvironmentAccountSecrets {
    [key: string]: EnvironmentAccount;
}

export const defaultEnvironments = ['prod', 'dev'];

class EnvironmentService {
    private environmentAccountSecrets: EnvironmentAccountSecrets = {} as EnvironmentAccountSecrets;

    async cacheSecrets(): Promise<void> {
        const environmentAccounts = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE);

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
        this.environmentAccountSecrets[accountEnvironment.secret_key] = {
            accountId: accountEnvironment.account_id,
            environmentId: accountEnvironment.id,
            environment: accountEnvironment.name
        };
    }

    async getAccountIdAndEnvironmentIdBySecretKey(secretKey: string): Promise<{ accountId: number; environmentId: number } | null> {
        if (!this.environmentAccountSecrets[secretKey]) {
            return null;
        }

        const { accountId, environmentId } = this.environmentAccountSecrets[secretKey] as EnvironmentAccount;

        return accountId != null && environmentId != null ? { accountId, environmentId } : null;
    }

    async getAccountIdFromEnvironment(environment_id: number): Promise<number | null> {
        const result = await db.knex.withSchema(db.schema()).select('account_id').from<Environment>(TABLE).where({ id: environment_id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].account_id;
    }

    async getAccountIdAndEnvironmentIdByPublicKey(publicKey: string): Promise<{ accountId: number; environmentId: number } | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ public_key: publicKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return { accountId: result[0].account_id, environmentId: result[0].id };
    }

    async getByAccountIdAndEnvironment(id: number): Promise<Environment | null> {
        try {
            const result = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ id });

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

    async getAccountAndEnvironmentById(account_id: number, environment: string): Promise<{ account: Account | null; environment: Environment | null }> {
        const account = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`).where({ id: account_id });

        if (account == null || account.length == 0 || account[0] == null) {
            return { account: null, environment: null };
        }

        const environmentResult = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ account_id, name: environment });

        if (environmentResult == null || environmentResult.length == 0 || environmentResult[0] == null) {
            return { account: null, environment: null };
        }

        return { account: account[0], environment: encryptionManager.decryptEnvironment(environmentResult[0]) };
    }

    async getById(id: number): Promise<Environment | null> {
        try {
            const result = await db.knex.withSchema(db.schema()).select('*').from<Environment>(TABLE).where({ id });

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

    async createEnvironment(accountId: number, environment: string): Promise<Environment | null> {
        const result: void | Pick<Environment, 'id'> = await db.knex
            .withSchema(db.schema())
            .from<Environment>(TABLE)
            .insert({ account_id: accountId, name: environment }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            const environmentId = result[0]['id'];
            const environment = await this.getById(environmentId);

            if (environment != null) {
                const encryptedEnvironment = encryptionManager.encryptEnvironment(environment);
                await db.knex.withSchema(db.schema()).from<Environment>(TABLE).where({ id: environmentId }).update(encryptedEnvironment);
                this.addToEnvironmentSecretCache(environment);
                return encryptedEnvironment;
            }
        }

        return null;
    }

    /**
     * Create Account
     * @desc create a new account and assign to the default environmenets
     */
    async createAccount(name: string): Promise<Account | null> {
        const result: void | Pick<Account, 'id'> = await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).insert({ name: name }, ['id']);

        if (Array.isArray(result) && result.length === 1 && result[0] != null && 'id' in result[0]) {
            for (const defaultEnvironment of defaultEnvironments) {
                await this.createEnvironment(result[0]['id'], defaultEnvironment);
            }

            return result[0];
        }

        return null;
    }

    async getEnvironmentName(id: number): Promise<string | null> {
        const result = await db.knex.withSchema(db.schema()).select('name').from<Environment>(TABLE).where({ id });

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
        const result = await db.knex.withSchema(db.schema()).select('id').from<Environment>(TABLE).where({ account_id: accountId, name: 'prod' });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].id;
    }

    async editCallbackUrl(callbackUrl: string, id: number): Promise<Environment | null> {
        return db.knex.withSchema(db.schema()).from<Environment>(TABLE).where({ id }).update({ callback_url: callbackUrl }, ['id']);
    }

    async editWebhookUrl(webhookUrl: string, id: number): Promise<Environment | null> {
        return db.knex.withSchema(db.schema()).from<Environment>(TABLE).where({ id }).update({ webhook_url: webhookUrl }, ['id']);
    }

    async getWebhookUrl(id: number): Promise<string | null> {
        const result = await db.knex.withSchema(db.schema()).select('webhook_url').from<Environment>(TABLE).where({ id });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].webhook_url;
    }

    async editHmacEnabled(hmacEnabled: boolean, id: number): Promise<Environment | null> {
        return db.knex.withSchema(db.schema()).from<Environment>(TABLE).where({ id }).update({ hmac_enabled: hmacEnabled }, ['id']);
    }

    async editHmacKey(hmacKey: string, id: number): Promise<Environment | null> {
        return db.knex.withSchema(db.schema()).from<Environment>(TABLE).where({ id }).update({ hmac_key: hmacKey }, ['id']);
    }

    async getEnvironmentVariables(environment_id: number): Promise<EnvironmentVariable[] | null> {
        const result = await db.knex.withSchema(db.schema()).select('*').from<EnvironmentVariable>(`_nango_environment_variables`).where({ environment_id });

        if (result === null || result.length === 0) {
            return [];
        }

        return encryptionManager.decryptEnvironmentVariables(result);
    }

    async editEnvironmentVariable(environment_id: number, values: Array<{ name: string; value: string }>): Promise<number[] | null> {
        await db.knex.withSchema(db.schema()).from<EnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).del();

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

        const results = await db.knex
            .withSchema(db.schema())
            .from<EnvironmentVariable>(`_nango_environment_variables`)
            .where({ environment_id })
            .insert(encryptedValues);

        if (results === null || results.length === 0) {
            return null;
        }

        return results;
    }
}

export default new EnvironmentService();
