import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';

import { assertWithinDeadline, batchDelete } from './batchDelete.js';
import { deleteConnectionData } from './deleteConnectionData.js';
import { deleteProviderConfigData } from './deleteProviderConfigData.js';

import type { DBConnectSession } from '../services/connectSession.service.js';
import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type {
    DBConnection,
    DBEndUser,
    DBEnvironment,
    DBEnvironmentVariable,
    DBExternalWebhook,
    DBOAuthSession,
    DBSlackNotification,
    IntegrationConfig
} from '@nangohq/types';

export async function deleteEnvironmentData(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting environment...', { environmentId: environment.id, environmentName: environment.name });

    // Delete OAuth sessions before connect_sessions (unindexed ON DELETE SET NULL FK on connect_session_id),
    // and delete connect_sessions before connections (connect_sessions.connection_id has NO ACTION FK).
    await deleteOAuthSessionsByEnvironmentId(environment, opts);
    await deleteConnectSessionsByEnvironmentId(environment, opts);

    await batchDelete({
        ...opts,
        name: 'providerConfigs < environments',
        deleteFn: async () => {
            const providerConfigs = await db.knex
                .from<IntegrationConfig, IntegrationConfig[]>('_nango_configs')
                .where({ environment_id: environment.id })
                .limit(opts.limit);

            for (const providerConfig of providerConfigs) {
                await deleteProviderConfigData(providerConfig, opts);
                assertWithinDeadline(opts.deadline, logger);
            }

            return providerConfigs.length;
        }
    });

    await deleteRemainingConnectionsByEnvironmentId(environment, opts);
    await deleteEndUserData(environment, opts);
    await deleteExternalWebhooksByEnvironmentId(environment, opts);
    await deleteSlackNotificationsByEnvironmentId(environment, opts);
    await deleteEnvironmentVariablesByEnvironmentId(environment, opts);

    await environmentService.hardDelete(environment.id);
}

async function deleteConnectSessionsByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all connect sessions in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'connect_sessions < environment',
        deleteFn: async () => {
            const connectSessions = await db.knex
                .from<DBConnectSession>('connect_sessions')
                .whereIn('id', function (sub) {
                    sub.select('id').from<DBConnectSession>('connect_sessions').where({ environment_id: environment.id }).limit(opts.limit);
                })
                .delete();

            return connectSessions;
        }
    });
}

async function deleteRemainingConnectionsByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;

    await batchDelete({
        ...opts,
        name: 'connections < environment',
        deleteFn: async () => {
            const connections = await db.knex
                .from<DBConnection, DBConnection[]>('_nango_connections')
                .where({ environment_id: environment.id })
                .limit(opts.limit);

            for (const connection of connections) {
                await deleteConnectionData(connection, opts);
                assertWithinDeadline(opts.deadline, logger);
            }

            return connections.length;
        }
    });
}

async function deleteEndUserData(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all end users in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'end_users < environment',
        deleteFn: async () => {
            const endUsers = await db.knex
                .from<DBEndUser>('end_users')
                .whereIn('id', function (sub) {
                    sub.select('id').from<DBEndUser>('end_users').where({ environment_id: environment.id }).limit(opts.limit);
                })
                .delete();

            return endUsers;
        }
    });
}

async function deleteOAuthSessionsByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all oauth sessions in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'oauth_sessions < environment',
        deleteFn: async () => {
            const oauthSessions = await db.knex
                .from<DBOAuthSession>('_nango_oauth_sessions')
                .whereIn('id', function (sub) {
                    sub.select('id').from<DBOAuthSession>('_nango_oauth_sessions').where({ environment_id: environment.id }).limit(opts.limit);
                })
                .delete();

            return oauthSessions;
        }
    });
}

async function deleteExternalWebhooksByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all webhooks in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'external_webhooks < environment',
        deleteFn: async () => {
            const externalWebhooksDeletedCount = await db.knex
                .from<DBExternalWebhook>('_nango_external_webhooks')
                .where({ environment_id: environment.id })
                .delete();

            return externalWebhooksDeletedCount;
        }
    });
}

async function deleteSlackNotificationsByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all slack notifications in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'slack_notifications < environment',
        deleteFn: async () => {
            const slackNotifications = await db.knex
                .from<DBSlackNotification>('_nango_slack_notifications')
                .whereIn('id', function (sub) {
                    sub.select('id').from<DBSlackNotification>('_nango_slack_notifications').where({ environment_id: environment.id }).limit(opts.limit);
                })
                .delete();

            return slackNotifications;
        }
    });
}

async function deleteEnvironmentVariablesByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all environment variables in environment...', { environmentId: environment.id, environmentName: environment.name });

    await batchDelete({
        ...opts,
        name: 'environment_variables < environment',
        deleteFn: async () => {
            const environmentVariablesDeletedCount = await db.knex
                .from<DBEnvironmentVariable>('_nango_environment_variables')
                .where({ environment_id: environment.id })
                .delete();

            return environmentVariablesDeletedCount;
        }
    });
}
