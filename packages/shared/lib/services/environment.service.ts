import * as z from 'zod';

import db from '@nangohq/database';
import { report, useLambdaKeepWarm } from '@nangohq/utils';

import { PROD_ENVIRONMENT_NAME } from '../constants.js';
import { configService, externalWebhookService, getGlobalOAuthCallbackUrl } from '../index.js';
import customerKeyService from './customerKey.service.js';
import { pubsub } from '../utils/pubsub.js';
import { getPlan } from './plans/plans.js';
import secretService from './secret.service.js';
import { LogActionEnum } from '../models/Telemetry.js';
import encryptionManager from '../utils/encryption.manager.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';

import type { Orchestrator } from '../index.js';
import type { Knex } from '@nangohq/database';
import type { DBEnvironment, DBEnvironmentVariable, SdkLogger } from '@nangohq/types';

const TABLE = '_nango_environments';

export const defaultEnvironments = [PROD_ENVIRONMENT_NAME, 'dev'];

/** After an environment row exists (outer transaction may still be open). Publishes keep-warm when Lambda + plan tenant isolation are enabled. */
async function onNewEnvironment(trx: Knex, { accountId, environmentId }: { accountId: number; environmentId: number }): Promise<void> {
    try {
        if (!useLambdaKeepWarm) {
            return;
        }
        const planRes = await getPlan(trx, { accountId });
        if (planRes.isErr()) {
            report(new Error('lambda_keep_warm_get_plan_failed', { cause: planRes.error }), { accountId });
            return;
        }
        if (!planRes.value.lambda_tenant_isolation) {
            return;
        }
        const res = await pubsub.publisher.publish({
            subject: 'lambda_keep_warm',
            type: 'lambda_keep_warm.invoke',
            payload: {
                accountId,
                environmentId,
                provisionedConcurrency: 1
            }
        });
        if (res.isErr()) {
            report(new Error('lambda_keep_warm_publish_failed', { cause: res.error }), { accountId, environmentId });
        }
    } catch (err) {
        report(err);
    }
}

class EnvironmentService {
    async getEnvironmentsByAccountId(account_id: number): Promise<Pick<DBEnvironment, 'id' | 'name' | 'is_production'>[]> {
        try {
            const result = await db.knex
                .select<Pick<DBEnvironment, 'name' | 'id' | 'is_production'>[]>('id', 'name', 'is_production')
                .from<DBEnvironment>(TABLE)
                .where({ account_id, deleted: false })
                .orderBy('name', 'asc');

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

    async getById(id: number): Promise<DBEnvironment | null> {
        return await db.readOnly.transaction(async (trx) => {
            const env = await this.getByIdWithoutSecrets(trx, id);
            if (!env) {
                return null;
            }
            await this.setSecretsOnEnv(trx, env);
            return env;
        });
    }

    private async getByIdWithoutSecrets(trx: Knex, id: number): Promise<DBEnvironment | null> {
        try {
            const [environment] = await trx<DBEnvironment>(TABLE).select('*').where({ id, deleted: false });
            return environment ?? null;
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
        return await db.readOnly.transaction(async (trx) => {
            const [environment] = await trx<DBEnvironment>(TABLE).select('*').where({ account_id: accountId, name, deleted: false });
            if (!environment) {
                return null;
            }
            await this.setSecretsOnEnv(trx, environment);
            return environment;
        });
    }

    async createEnvironment(trx = db.knex, { accountId, name }: { accountId: number; name: string }): Promise<DBEnvironment | null> {
        const environment = await trx.transaction(async (innerTrx) => {
            const [env] = await innerTrx<DBEnvironment>(TABLE)
                .insert({ account_id: accountId, name, is_production: name === PROD_ENVIRONMENT_NAME })
                .returning('*');
            if (!env) {
                innerTrx.rollback();
                return null;
            }
            // Invariant: Every environment always has one default key (used by runners for persist auth).
            const created = await secretService.createSecret(innerTrx, {
                environmentId: env.id,
                displayName: 'default',
                isDefault: true
            });
            if (created.isErr()) {
                throw created.error;
            }
            const secret = created.value;
            env.secret_key = secret.secret;
            env.pending_secret_key = null;

            const apiKey = await customerKeyService.createApiKey(innerTrx, {
                accountId: accountId,
                environmentId: env.id,
                displayName: 'Default - Full access'
            });
            if (apiKey.isErr()) {
                throw apiKey.error;
            }

            const webhookKey = await customerKeyService.createWebhookSigningKey(innerTrx, {
                accountId: accountId,
                environmentId: env.id
            });
            if (webhookKey.isErr()) {
                throw webhookKey.error;
            }

            return env;
        });

        if (environment) {
            await onNewEnvironment(trx, { accountId, environmentId: environment.id });
        }
        return environment;
    }

    async createDefaultEnvironments(trx: Knex, { accountId: accountId }: { accountId: number }): Promise<void> {
        for (const environment of defaultEnvironments) {
            const newEnv = await this.createEnvironment(trx, { accountId, name: environment });
            if (newEnv) {
                await externalWebhookService.update(trx, {
                    environment_id: newEnv.id,
                    data: {
                        on_auth_creation: true,
                        on_auth_refresh_error: true,
                        on_sync_completion_always: true,
                        on_sync_error: true
                    }
                });
            }
        }
    }

    async getEnvironmentsWithOtlpSettings(): Promise<DBEnvironment[]> {
        return await db.readOnly.transaction(async (trx) => {
            const envs = await trx<DBEnvironment>(TABLE).select('*').where({ deleted: false }).whereNotNull('otlp_settings');
            await this.setAllSecrets(trx, envs);
            return envs;
        });
    }

    async getEnvironmentsByIds(environmentIds: number[]): Promise<DBEnvironment[]> {
        if (environmentIds.length === 0) {
            return [];
        }
        return await db.readOnly.transaction(async (trx) => {
            const envs = await trx<DBEnvironment>(TABLE).select('*').whereIn('id', environmentIds).andWhere({ deleted: false });
            await this.setAllSecrets(trx, envs);
            return envs;
        });
    }

    async getSlackNotificationsEnabled(environmentId: number, trx = db.knex): Promise<boolean | null> {
        const result = await trx.select('slack_notifications').from<DBEnvironment>(TABLE).where({ id: environmentId, deleted: false });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].slack_notifications;
    }

    async update({
        accountId,
        environmentId,
        data
    }: {
        accountId: number;
        environmentId: number;
        data: Omit<Partial<DBEnvironment>, 'account_id' | 'id' | 'created_at' | 'updated_at'>;
    }): Promise<DBEnvironment | null> {
        return await db.knex.transaction(async (trx) => {
            const [environment] = await trx<DBEnvironment>(TABLE)
                .where({ account_id: accountId, id: environmentId, deleted: false })
                .update(data)
                .returning('*');
            if (!environment) {
                trx.rollback();
                return null;
            }
            await this.setSecretsOnEnv(trx, environment);
            return environment;
        });
    }

    async getEnvironmentVariables(environment_id: number): Promise<DBEnvironmentVariable[]> {
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

        const mappedValues: Omit<DBEnvironmentVariable, 'id'>[] = values.map((value) => {
            return {
                ...value,
                created_at: new Date(),
                updated_at: new Date(),
                environment_id,
                value_iv: null,
                value_tag: null
            };
        });

        const encryptedValues = encryptionManager.encryptEnvironmentVariables(mappedValues);

        const results = await db.knex.from<DBEnvironmentVariable>(`_nango_environment_variables`).where({ environment_id }).insert(encryptedValues);

        if (results === null || results.length === 0) {
            return null;
        }

        return results;
    }

    async getOauthCallbackUrl(environmentId?: number): Promise<string> {
        const globalCallbackUrl = getGlobalOAuthCallbackUrl();

        if (environmentId != null) {
            // TODO: remove this call
            const environment: DBEnvironment | null = await this.getById(environmentId);
            return environment?.callback_url || globalCallbackUrl;
        }

        return globalCallbackUrl;
    }
    async getSdkLogger(id: number): Promise<SdkLogger> {
        const defaultLevel = 'warn';
        const levelSchema = z.enum(['debug', 'info', 'warn', 'error', 'off']).default(defaultLevel);
        const envVars = await this.getEnvironmentVariables(id);
        const parsed = levelSchema.safeParse(envVars.find((ev) => ev.name === 'NANGO_LOGGER_LEVEL')?.value);
        const level = parsed.success ? parsed.data : defaultLevel; // fallback to default if parsing fails
        return { level };
    }

    async softDelete({ environmentId, orchestrator }: { environmentId: number; orchestrator: Orchestrator }): Promise<void> {
        const configs = await configService.listProviderConfigs(db.knex, environmentId);
        for (const config of configs) {
            // This handles deleting connections and syncs down the line
            await configService.deleteProviderConfig({
                id: config.id!,
                environmentId,
                providerConfigKey: config.unique_key,
                orchestrator
            });
        }

        await db.knex.from<DBEnvironment>(TABLE).where({ id: environmentId, deleted: false }).update({ deleted: true, deleted_at: new Date() });
    }

    async getSoftDeleted({ limit, olderThan }: { limit: number; olderThan: number }): Promise<DBEnvironment[]> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - olderThan);

        return await db.knex
            .select('*')
            .from<DBEnvironment>(`_nango_environments`)
            .where('deleted', true)
            .andWhere('deleted_at', '<=', dateThreshold.toISOString())
            .limit(limit);
    }

    async hardDelete(id: number): Promise<number> {
        return await db.knex.from<DBEnvironment>(TABLE).where({ id }).delete();
    }

    private async setAllSecrets(trx: Knex, envs: DBEnvironment[]) {
        // Precondition: `envs` contains no duplicates.

        // Note: For now, exactly one default secret per environment exists
        // and zero or one non-default secret: The pending secret (during rotation).
        const envByID = new Map(envs.map((env) => [env.id, env]));
        const allSecrets = await secretService.getAllSecretsForAllEnvs(trx, Array.from(envByID.keys()));
        if (allSecrets.isErr()) {
            throw allSecrets.error;
        }
        for (const [envId, secrets] of allSecrets.value) {
            const env = envByID.get(envId)!;
            env.pending_secret_key = null;
            for (const secret of secrets) {
                if (secret.is_default) {
                    env.secret_key = secret.secret;
                } else {
                    env.pending_secret_key = secret.secret;
                }
            }
        }
    }

    private async setSecretsOnEnv(trx: Knex, env: DBEnvironment) {
        // Note: For now, exactly one default secret per environment exists
        // and zero or one non-default secret: The pending secret (during rotation).
        env.pending_secret_key = null;
        const secrets = await secretService.getAllSecretsForEnv(trx, env.id);
        if (secrets.isErr()) {
            throw secrets.error;
        }
        for (const secret of secrets.value) {
            if (secret.is_default) {
                env.secret_key = secret.secret;
            } else {
                env.pending_secret_key = secret.secret;
            }
        }
    }
}

export default new EnvironmentService();
