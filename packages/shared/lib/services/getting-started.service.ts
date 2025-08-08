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

export async function createGettingStartedMeta(accountId: number, environmentId: number): Promise<Result<DBGettingStartedMeta>> {
    try {
        const result = await db.knex
            .from<DBGettingStartedMeta>('getting_started_meta')
            .insert({ account_id: accountId, environment_id: environmentId })
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

export async function getByUserId(userId: number): Promise<Result<GettingStartedProgressOutput>> {
    const result = await db.knex
        .select<{
            getting_started_progress: DBGettingStartedProgress;
            environment: DBEnvironment;
            integration: IntegrationConfig;
            connection: DBConnection | null;
        }>('progress.* as progress', 'env.* as environment', 'config.* as integration', 'conn.* as connection')
        .from('getting_started_progress as progress')
        .leftJoin('getting_started_meta as meta', 'meta.id', 'progress.getting_started_meta_id')
        .leftJoin('_nango_environments as env', 'env.id', 'meta.environment_id')
        .leftJoin('_nango_configs as config', 'config.id', 'meta.integration_id')
        .leftJoin('_nango_connections as conn', 'conn.id', 'progress.connection_id')
        .where({ user_id: userId })
        .first();

    if (!result) {
        return Err(new Error('getting_started_progress_not_found'));
    }

    return Ok({
        meta: {
            integration: result.integration,
            environment: result.environment
        },
        connection: result.connection ?? null,
        step: result.getting_started_progress.step
    });
}

export function updateByUserId(userId: number, data: Partial<DBGettingStartedProgress>) {
    return db.knex.from<DBGettingStartedProgress>('getting_started_progress').where({ user_id: userId }).update(data);
}

/**
 * Gets getting started progress for the user, or creates it if it doesn't exist.
 */
export async function getOrCreateProgressByUser(user: DBUser, currentEnvironmentId: number): Promise<Result<GettingStartedProgressOutput>> {
    const existingResult = await getByUserId(user.id);

    if (existingResult.isOk()) {
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

    return getByUserId(createdResult.value.user_id);
}

/**
 * Update getting started progress for a user and return the updated object.
 */
export async function patchProgressByUser(user: DBUser, currentEnvironmentId: number, input: PatchGettingStartedInput): Promise<Result<void>> {
    // Ensure meta/progress exist and fetch meta information (environment, integration)
    const existing = await getOrCreateProgressByUser(user, currentEnvironmentId);
    if (existing.isErr()) {
        return Err(existing.error);
    }

    const { meta } = existing.value;

    const update: Partial<DBGettingStartedProgress> = {};

    if (typeof input.step !== 'undefined') {
        update.step = input.step;
    }
    if (typeof input.complete !== 'undefined') {
        update.complete = input.complete;
    }

    if (typeof input.connection_id !== 'undefined') {
        if (input.connection_id === null || input.connection_id === '') {
            update.connection_id = null;
        } else {
            try {
                const configId = meta.integration.id;
                if (!configId) {
                    // Should never happen
                    return Err(new Error('invalid_integration_id'));
                }

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

async function getOrCreateGettingStartedMeta(accountId: number, currentEnvironmentId: number): Promise<Result<DBGettingStartedMeta>> {
    const existingMeta = await db.knex.from<DBGettingStartedMeta>('getting_started_meta').where({ account_id: accountId }).first();

    if (existingMeta) {
        return Ok(existingMeta);
    }

    const googleCalendarIntegrationId = await getOrCreateGoogleCalendarIntegration(currentEnvironmentId);

    if (googleCalendarIntegrationId.isErr()) {
        return Err(googleCalendarIntegrationId.error);
    }

    try {
        const newMeta = await createGettingStartedMeta(accountId, currentEnvironmentId);

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
