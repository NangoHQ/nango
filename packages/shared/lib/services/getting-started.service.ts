import { pick } from 'lodash-es';

import { getProvider } from '@nangohq/providers';
import { Err, Ok } from '@nangohq/utils';

import configService from './config.service.js';
import connectionService from './connection.service.js';
import sharedCredentialsService from './shared-credentials.service.js';

import type {
    CreateGettingStartedMeta,
    CreateGettingStartedProgress,
    DBConnection,
    DBEnvironment,
    DBGettingStartedMeta,
    DBGettingStartedProgress,
    DBUser,
    GettingStartedOutput as GettingStartedProgressOutput,
    IntegrationConfig,
    PatchGettingStartedInput
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export async function createMeta(db: Knex, input: CreateGettingStartedMeta): Promise<Result<DBGettingStartedMeta>> {
    try {
        const [gettingStartedMeta] = await db.from<DBGettingStartedMeta>('getting_started_meta').insert(input).returning('*');

        return gettingStartedMeta ? Ok(gettingStartedMeta) : Err('failed_to_create_getting_started_meta');
    } catch (err) {
        return Err(new Error('failed_to_create_getting_started_meta', { cause: err }));
    }
}

export async function createProgress(db: Knex, input: CreateGettingStartedProgress): Promise<Result<DBGettingStartedProgress>> {
    try {
        const [gettingStartedProgress] = await db.from<DBGettingStartedProgress>('getting_started_progress').insert(input).returning('*');

        return gettingStartedProgress ? Ok(gettingStartedProgress) : Err('failed_to_create_getting_started_progress');
    } catch (err) {
        return Err(new Error('failed_to_create_getting_started_progress', { cause: err }));
    }
}

export async function getProgressByUserId(db: Knex, userId: number): Promise<Result<GettingStartedProgressOutput | null>> {
    try {
        const result = await db
            .from<DBGettingStartedProgress>('getting_started_progress as progress')
            .select<{
                progress: DBGettingStartedProgress;
                environment: DBEnvironment;
                integration: IntegrationConfig;
                connection: DBConnection | null;
            }>(
                db.raw('row_to_json(progress.*) as progress'),
                db.raw('row_to_json(env.*) as environment'),
                db.raw('row_to_json(config.*) as integration'),
                db.raw('row_to_json(conn.*) as connection')
            )
            .leftJoin('getting_started_meta as meta', 'meta.id', 'progress.getting_started_meta_id')
            .leftJoin('_nango_environments as env', 'env.id', 'meta.environment_id')
            .leftJoin('_nango_configs as config', 'config.id', 'meta.integration_id')
            .leftJoin('_nango_connections as conn', function () {
                this.on('conn.id', '=', 'progress.connection_id').andOnNull('conn.deleted_at');
            })
            .where({ user_id: userId })
            .first();

        if (!result) {
            return Ok(null);
        }

        return Ok({
            meta: {
                integration: pick(result.integration, ['id', 'unique_key', 'provider', 'display_name']),
                environment: pick(result.environment, ['id', 'name'])
            },
            connection: result.connection ? pick(result.connection, ['id', 'connection_id']) : null,
            step: result.progress.step
        });
    } catch (err) {
        return Err(new Error('failed_to_get_getting_started_progress', { cause: err }));
    }
}

export async function getMetaByAccountId(db: Knex, accountId: number): Promise<Result<DBGettingStartedMeta | null>> {
    try {
        const gettingStartedMeta = await db.from<DBGettingStartedMeta>('getting_started_meta').where({ account_id: accountId }).first();

        return gettingStartedMeta ? Ok(gettingStartedMeta) : Ok(null);
    } catch (err) {
        return Err(new Error('failed_to_get_getting_started_meta', { cause: err }));
    }
}

export async function updateByUserId(db: Knex, userId: number, data: Partial<DBGettingStartedProgress>): Promise<Result<DBGettingStartedProgress>> {
    try {
        const [updated] = await db.from<DBGettingStartedProgress>('getting_started_progress').where({ user_id: userId }).update(data).returning('*');

        return updated ? Ok(updated) : Err('failed_to_update_getting_started_progress');
    } catch (err) {
        return Err(new Error('failed_to_update_getting_started_progress', { cause: err }));
    }
}

/**
 * Gets getting started progress for the user, or creates it if it doesn't exist.
 */
export async function getOrCreateProgressByUser(db: Knex, user: DBUser, currentEnvironmentId: number): Promise<Result<GettingStartedProgressOutput>> {
    return db.transaction(async (trx) => {
        const existingResult = await getProgressByUserId(trx, user.id);

        if (existingResult.isErr()) {
            return Err(existingResult.error);
        }

        if (existingResult.value !== null) {
            return Ok(existingResult.value);
        }

        const gettingStartedMeta = await getOrCreateMeta(trx, user.account_id, currentEnvironmentId);

        if (gettingStartedMeta.isErr()) {
            return Err(gettingStartedMeta.error);
        }

        const createdResult = await createProgress(trx, {
            user_id: user.id,
            getting_started_meta_id: gettingStartedMeta.value.id,
            step: 0,
            connection_id: null
        });

        if (createdResult.isErr()) {
            return Err(createdResult.error);
        }

        const newProgress = await getProgressByUserId(trx, createdResult.value.user_id);
        if (newProgress.isErr()) {
            return Err(newProgress.error);
        }

        if (newProgress.value === null) {
            return Err('failed_to_get_getting_started_progress');
        }

        return Ok(newProgress.value);
    });
}

/**
 * Update getting started progress for a user and return the updated object.
 */
export async function patchProgressByUser(db: Knex, user: DBUser, input: PatchGettingStartedInput): Promise<Result<void>> {
    return db.transaction(async (trx) => {
        // Ensure meta/progress exist and fetch meta information (environment, integration)
        const existing = await getProgressByUserId(trx, user.id);
        if (existing.isErr()) {
            return Err(existing.error);
        }

        if (existing.value === null) {
            return Err('getting_started_progress_not_found');
        }

        const update: Partial<DBGettingStartedProgress> = {};

        if (typeof input.step !== 'undefined') {
            update.step = input.step;
        }

        if (typeof input.connection_id !== 'undefined') {
            if (input.connection_id === null || input.connection_id === '') {
                update.connection_id = null;
            } else {
                try {
                    const { error, response: connection } = await connectionService.getConnection(
                        input.connection_id,
                        existing.value.meta.integration.unique_key,
                        existing.value.meta.environment.id
                    );

                    if (error || !connection) {
                        return Err(new Error('connection_not_found', { ...(error ? { cause: error } : {}) }));
                    }

                    update.connection_id = connection.id;
                } catch (err) {
                    return Err(new Error('failed_to_update_getting_started_progress', { cause: err }));
                }
            }
        }

        try {
            if (Object.keys(update).length > 0) {
                await updateByUserId(trx, user.id, update);
            }
        } catch (err) {
            return Err(new Error('failed_to_update_getting_started_progress', { cause: err }));
        }

        return Ok(undefined);
    });
}

export async function getOrCreateMeta(db: Knex, accountId: number, currentEnvironmentId: number): Promise<Result<DBGettingStartedMeta>> {
    return db.transaction(async (trx) => {
        const existingMeta = await getMetaByAccountId(trx, accountId);

        if (existingMeta.isErr()) {
            return Err(existingMeta.error);
        }

        if (existingMeta.value !== null) {
            return Ok(existingMeta.value);
        }

        const integrationId = await getOrCreateGettingStartedIntegration(currentEnvironmentId, {
            providerName: 'github',
            uniqueKey: 'github-getting-started',
            displayName: 'GitHub OAuth (Getting Started)'
        });

        if (integrationId.isErr()) {
            return Err(integrationId.error);
        }

        const newMeta = await createMeta(trx, {
            account_id: accountId,
            environment_id: currentEnvironmentId,
            integration_id: integrationId.value
        });

        if (newMeta.isErr()) {
            return Err('failed_to_create_getting_started_meta');
        }

        return Ok(newMeta.value);
    });
}

async function getOrCreateGettingStartedIntegration(
    environmentId: number,
    {
        providerName,
        uniqueKey,
        displayName
    }: {
        providerName: string;
        uniqueKey: string;
        displayName: string;
    }
): Promise<Result<number>> {
    try {
        const existingIntegrationId = await configService.getIdByProviderConfigKey(environmentId, uniqueKey);

        if (existingIntegrationId) {
            return Ok(existingIntegrationId);
        }

        const provider = getProvider(providerName);
        if (!provider) {
            return Err('getting_started_provider_not_found');
        }

        const newIntegration = await sharedCredentialsService.createPreprovisionedProvider({
            providerName,
            environment_id: environmentId,
            provider,
            display_name: displayName,
            unique_key: uniqueKey
        });

        if (newIntegration.isErr()) {
            return Err(newIntegration.error);
        }

        const id = newIntegration.value.id ?? null;

        if (!id) {
            return Err('failed_to_create_getting_started_integration');
        }

        return Ok(id);
    } catch (err) {
        return Err(new Error('failed_to_get_or_create_getting_started_integration', { cause: err }));
    }
}

export async function deleteMetaByIntegrationId(db: Knex, integrationId: number): Promise<Result<void>> {
    try {
        const result = await db.from<DBGettingStartedMeta>('getting_started_meta').where({ integration_id: integrationId }).delete();

        return result && result > 0 ? Ok(undefined) : Err('failed_to_delete_getting_started_meta');
    } catch (err) {
        return Err(new Error('failed_to_delete_getting_started_meta', { cause: err }));
    }
}
