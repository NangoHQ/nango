import * as z from 'zod';

import db from '@nangohq/database';
import { Err, Ok, report, useLambdaKeepWarm } from '@nangohq/utils';

import { PROD_ENVIRONMENT_NAME } from '../constants.js';
import { configService, externalWebhookService, getGlobalOAuthCallbackUrl } from '../index.js';
import { LogActionEnum } from '../models/Telemetry.js';
import { getEncryptionManager } from '../utils/encryption.manager.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { pubsub } from '../utils/pubsub.js';
import customerKeyService from './customerKey.service.js';
import { getPlan, lambdaKeepWarmProvisionedConcurrencyMultiplier } from './plans/plans.js';
import secretService from './secret.service.js';

import type { Orchestrator } from '../index.js';
import type { Knex } from '@nangohq/database';
import type { DBEnvironment, DBEnvironmentVariable, DBPlan, SdkLogger } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const TABLE = '_nango_environments';

export const defaultEnvironments = [PROD_ENVIRONMENT_NAME, 'dev'];

export type CreateEnvironmentErrorCode = 'invalid_is_prod_flag' | 'conflict' | 'resource_capped' | 'creation_failed';

type EnvironmentIdentifier = { type: 'id'; id: number } | { type: 'uuid'; uuid: string };

export class CreateEnvironmentError extends Error {
    constructor(
        public readonly code: CreateEnvironmentErrorCode,
        options?: { cause?: unknown }
    ) {
        super(code, options);
    }
}

/** After an environment row exists (outer transaction may still be open). Publishes keep-warm when Lambda + plan tenant isolation are enabled. */
async function onNewEnvironment(
    trx: Knex,
    { accountId, environmentId, isProduction }: { accountId: number; environmentId: number; isProduction: boolean }
): Promise<void> {
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
                provisionedConcurrency: lambdaKeepWarmProvisionedConcurrencyMultiplier(planRes.value.name, isProduction)
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
    private resolveIsProduction({ name, isProduction }: { name: string; isProduction?: boolean | undefined }): Result<boolean, CreateEnvironmentError> {
        if (name === PROD_ENVIRONMENT_NAME && isProduction === false) {
            return Err(new CreateEnvironmentError('invalid_is_prod_flag'));
        }

        return Ok(name === PROD_ENVIRONMENT_NAME ? true : (isProduction ?? false));
    }

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
            const env = await this.getWithoutSecrets(trx, { type: 'id', id });
            if (!env) {
                return null;
            }
            await this.setSecretsOnEnv(trx, env);
            return env;
        });
    }

    async getByIdWithoutSecrets(id: number, accountId: number | null = null): Promise<DBEnvironment | null> {
        return await db.readOnly.transaction((trx) => this.getWithoutSecrets(trx, { type: 'id', id, accountId }));
    }

    async getByUuidWithoutSecrets(uuid: string, accountId: number | null = null): Promise<DBEnvironment | null> {
        return await db.readOnly.transaction((trx) => this.getWithoutSecrets(trx, { type: 'uuid', uuid, accountId }));
    }

    private async getWithoutSecrets(trx: Knex, identifier: EnvironmentIdentifier & { accountId?: number | null }): Promise<DBEnvironment | null> {
        const accountId = identifier.accountId ?? null;
        try {
            const query = trx<DBEnvironment>(TABLE).select('*').where({ deleted: false });
            if (identifier.type === 'id') {
                query.andWhere({ id: identifier.id });
            } else {
                query.andWhere({ uuid: identifier.uuid });
            }
            if (accountId !== null) {
                query.andWhere({ account_id: accountId });
            }
            const [environment] = await query;
            return environment ?? null;
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                ...(accountId !== null && { accountId }),
                ...(identifier.type === 'id' ? { environmentId: identifier.id } : { environmentUuid: identifier.uuid }),
                metadata: identifier.type === 'id' ? { id: identifier.id } : { uuid: identifier.uuid }
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

    async createEnvironment(
        trx = db.knex,
        {
            accountId,
            name,
            isProduction: isProductionSetting,
            callbackUrl,
            hmacKey,
            hmacEnabled,
            slackNotifications,
            otlpSettings,
            plan
        }: {
            accountId: number;
            name: string;
            isProduction?: boolean;
            callbackUrl?: string;
            hmacKey?: string;
            hmacEnabled?: boolean;
            slackNotifications?: boolean;
            otlpSettings?: DBEnvironment['otlp_settings'];
            plan?: DBPlan | null;
        }
    ): Promise<Result<DBEnvironment, CreateEnvironmentError>> {
        const isProduction = this.resolveIsProduction({ name, isProduction: isProductionSetting });
        if (isProduction.isErr()) {
            return Err(isProduction.error);
        }

        let environmentId: number | undefined;
        try {
            const environments = await trx<DBEnvironment>(TABLE).select('name').where({ account_id: accountId, deleted: false });
            // NOTE: This preserves the pre-existing race condition in environment-cap enforcement: concurrent creations can each pass this check and exceed the cap.
            // Environment caps are an upper limit rather than a strict boundary, so a small overflow is acceptable.
            if (plan && environments.length >= plan.environments_max) {
                return Err(new CreateEnvironmentError('resource_capped'));
            }
            if (environments.some((environment) => environment.name === name)) {
                return Err(new CreateEnvironmentError('conflict'));
            }

            const environment = await trx.transaction(async (innerTrx): Promise<DBEnvironment> => {
                const [env] = await innerTrx<DBEnvironment>(TABLE)
                    .insert({
                        account_id: accountId,
                        name,
                        is_production: isProduction.value,
                        ...(callbackUrl !== undefined && { callback_url: callbackUrl }),
                        ...(hmacKey !== undefined && { hmac_key: hmacKey }),
                        ...(hmacEnabled !== undefined && { hmac_enabled: hmacEnabled }),
                        ...(slackNotifications !== undefined && { slack_notifications: slackNotifications }),
                        ...(otlpSettings !== undefined && { otlp_settings: otlpSettings })
                    })
                    .returning('*');
                if (!env) {
                    throw Error('failed_to_insert_environment');
                }
                environmentId = env.id;
                // Invariant: Every environment always has one default key (used by runners for persist auth).
                const createdSecret = await secretService.createSecret(innerTrx, {
                    environmentId: env.id,
                    displayName: 'default',
                    isDefault: true
                });
                if (createdSecret.isErr()) {
                    throw createdSecret.error;
                }
                const secret = createdSecret.value;
                env.secret_key = secret.secret;
                env.pending_secret_key = null;

                const createdApiKey = await customerKeyService.createApiKey(innerTrx, {
                    accountId: accountId,
                    environmentId: env.id,
                    displayName: 'Default - Full access'
                });
                if (createdApiKey.isErr()) {
                    throw createdApiKey.error;
                }

                const createdWebhookKey = await customerKeyService.createWebhookSigningKey(innerTrx, {
                    accountId: accountId,
                    environmentId: env.id
                });
                if (createdWebhookKey.isErr()) {
                    throw createdWebhookKey.error;
                }

                await externalWebhookService.update(innerTrx, {
                    environment_id: env.id,
                    data: {
                        on_auth_creation: true,
                        on_auth_refresh_error: true,
                        on_sync_completion_always: true,
                        on_sync_error: true,
                        on_connection_deletion: true
                    }
                });

                return env;
            });

            await onNewEnvironment(trx, { accountId, environmentId: environment.id, isProduction: isProduction.value });
            return Ok(environment);
        } catch (err) {
            report(err, { accountId, environmentId, environmentName: name });
            return Err(new CreateEnvironmentError('creation_failed', { cause: err }));
        }
    }

    async createDefaultEnvironments(trx: Knex, { accountId }: { accountId: number }): Promise<Result<void, CreateEnvironmentError>> {
        for (const environment of defaultEnvironments) {
            const createdEnv = await this.createEnvironment(trx, { accountId, name: environment });
            if (createdEnv.isErr()) {
                return Err(createdEnv.error);
            }
        }

        return Ok();
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

    // Cheap variant: skip secret decryption when only id→name is needed.
    async getEnvironmentNamesByIds(environmentIds: number[]): Promise<Map<number, string>> {
        if (environmentIds.length === 0) {
            return new Map();
        }
        const rows = await db.readOnly<DBEnvironment>(TABLE).select('id', 'name').whereIn('id', environmentIds).andWhere({ deleted: false });
        return new Map(rows.map((r) => [r.id, r.name]));
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

        return getEncryptionManager().decryptEnvironmentVariables(result);
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

        const encryptedValues = getEncryptionManager().encryptEnvironmentVariables(mappedValues);

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
