import { pick } from 'lodash-es';

import db from '@nangohq/database';
import { getProvider } from '@nangohq/providers';
import { Err, Ok } from '@nangohq/utils';

import configService from './config.service.js';
import sharedCredentialsService from './shared-credentials.service.js';

import type {
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

export async function createGettingStartedMeta(accountId: number, environmentId: number, integrationId: number): Promise<Result<DBGettingStartedMeta>> {
    try {
        const result = await db.knex
            .from<DBGettingStartedMeta>('getting_started_meta')
            .insert({ account_id: accountId, environment_id: environmentId, integration_id: integrationId })
            .returning('*');

        if (!result[0]) {
            return Err(new Error('failed_to_create_getting_started_meta'));
        }

        return Ok(result[0]);
    } catch (err) {
        return Err(new Error('failed_to_create_getting_started_meta', { cause: err }));
    }
}

export async function createGettingStartedProgress(userId: number, metaId: number): Promise<Result<DBGettingStartedProgress>> {
    try {
        const result = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress')
            .insert({ user_id: userId, getting_started_meta_id: metaId })
            .returning('*');

        const gettingStartedProgress = result[0];

        if (!gettingStartedProgress) {
            return Err(new Error('failed_to_create_getting_started_progress'));
        }

        return Ok(gettingStartedProgress);
    } catch (err) {
        return Err(new Error('failed_to_create_getting_started_progress', { cause: err }));
    }
}

export async function getProgressByUserId(userId: number): Promise<Result<GettingStartedProgressOutput | null>> {
    try {
        const result = await db.knex
            .from<DBGettingStartedProgress>('getting_started_progress as progress')
            .select<{
                progress: DBGettingStartedProgress;
                environment: DBEnvironment;
                integration: IntegrationConfig;
                connection: DBConnection | null;
            }>(
                db.knex.raw('row_to_json(progress.*) as progress'),
                db.knex.raw('row_to_json(env.*) as environment'),
                db.knex.raw('row_to_json(config.*) as integration'),
                db.knex.raw('row_to_json(conn.*) as connection')
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
        console.error('failed_to_get_getting_started_progress', err);
        return Err(new Error('failed_to_get_getting_started_progress', { cause: err }));
    }
}

export function updateByUserId(userId: number, data: Partial<DBGettingStartedProgress>) {
    return db.knex.from<DBGettingStartedProgress>('getting_started_progress').where({ user_id: userId }).update(data);
}

/**
 * Gets getting started progress for the user, or creates it if it doesn't exist.
 */
export async function getOrCreateProgressByUser(user: DBUser, currentEnvironmentId: number): Promise<Result<GettingStartedProgressOutput>> {
    const existingResult = await getProgressByUserId(user.id);

    if (existingResult.isErr()) {
        return Err(existingResult.error);
    }

    if (existingResult.value !== null) {
        return Ok(existingResult.value);
    }

    const gettingStartedMeta = await getOrCreateGettingStartedMeta(user.account_id, currentEnvironmentId);

    if (gettingStartedMeta.isErr()) {
        return Err(gettingStartedMeta.error);
    }

    const createdResult = await createGettingStartedProgress(user.id, gettingStartedMeta.value.id);

    if (createdResult.isErr()) {
        return Err(createdResult.error);
    }

    const newProgress = await getProgressByUserId(createdResult.value.user_id);
    if (newProgress.isErr()) {
        return Err(newProgress.error);
    }

    if (newProgress.value === null) {
        return Err(new Error('failed_to_get_getting_started_progress'));
    }

    return Ok(newProgress.value);
}

/**
 * Update getting started progress for a user and return the updated object.
 */
export async function patchProgressByUser(user: DBUser, input: PatchGettingStartedInput): Promise<Result<void>> {
    // Ensure meta/progress exist and fetch meta information (environment, integration)
    const existing = await getProgressByUserId(user.id);
    if (existing.isErr()) {
        return Err(existing.error);
    }

    if (existing.value === null) {
        return Err(new Error('getting_started_progress_not_found'));
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
                const connection = await db.knex
                    .from<DBConnection>('_nango_connections')
                    .select<{ id: number }[]>('id')
                    .where({
                        connection_id: input.connection_id,
                        deleted: false
                    })
                    .first();

                if (!connection) {
                    return Err(new Error('connection_not_found'));
                }

                update.connection_id = connection.id;
            } catch (err) {
                return Err(new Error('failed_to_update_getting_started_progress', { cause: err }));
            }
        }
    }

    try {
        if (Object.keys(update).length > 0) {
            await updateByUserId(user.id, update);
        }
    } catch (err) {
        return Err(new Error('failed_to_update_getting_started_progress', { cause: err }));
    }

    return Ok(undefined);
}

export async function getOrCreateGettingStartedMeta(accountId: number, currentEnvironmentId: number): Promise<Result<DBGettingStartedMeta>> {
    const existingMeta = await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ account_id: accountId }).first();

    if (existingMeta) {
        return Ok(existingMeta);
    }

    const googleCalendarIntegrationId = await getOrCreateGoogleCalendarIntegration(currentEnvironmentId);

    if (googleCalendarIntegrationId.isErr()) {
        return Err(googleCalendarIntegrationId.error);
    }

    try {
        const newMeta = await createGettingStartedMeta(accountId, currentEnvironmentId, googleCalendarIntegrationId.value);

        if (newMeta.isErr()) {
            return Err(new Error('failed_to_create_getting_started_meta'));
        }

        return Ok(newMeta.value);
    } catch (err) {
        return Err(new Error('failed_to_create_getting_started_meta', { cause: err }));
    }
}

async function getOrCreateGoogleCalendarIntegration(environmentId: number): Promise<Result<number>> {
    const existingIntegrationId = await configService.getIdByProviderConfigKey(environmentId, 'google-calendar-getting-started');

    if (existingIntegrationId) {
        return Ok(existingIntegrationId);
    }

    const PROVIDER_NAME = 'google-calendar';

    const provider = getProvider(PROVIDER_NAME);
    if (!provider) {
        return Err(new Error('google_calendar_provider_not_found'));
    }

    const newIntegration = await sharedCredentialsService.createPreprovisionedProvider({
        providerName: PROVIDER_NAME,
        environment_id: environmentId,
        provider,
        display_name: 'Google Calendar (Getting Started)',
        unique_key: 'google-calendar-getting-started'
    });

    if (newIntegration.isErr()) {
        return Err(newIntegration.error);
    }

    const id = newIntegration.value.id ?? null;

    if (!id) {
        return Err(new Error('failed_to_create_google_calendar_integration'));
    }

    return Ok(id);
}

export async function deleteMetaByIntegrationId(integrationId: number): Promise<Result<void>> {
    const result = await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ integration_id: integrationId }).delete();

    if (result === 0) {
        return Err(new Error('failed_to_delete_getting_started_meta'));
    }

    return Ok(undefined);
}
