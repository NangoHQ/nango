import db from '@nangohq/database';
import { environmentService } from '@nangohq/shared';

import { batchDelete } from './batchDelete.js';
import { deleteEndUserData } from './deleteEndUserData.js';
import { deleteProviderConfigData } from './deleteProviderConfigData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { Config } from '@nangohq/shared';
import type { DBEndUser, DBEnvironment, DBEnvironmentVariable, DBExternalWebhook, DBSlackNotification } from '@nangohq/types';

export async function deleteEnvironmentData(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting environment...', environment.id, environment.name);

    await batchDelete({
        ...opts,
        name: 'providerConfigs < environments',
        deleteFn: async () => {
            const providerConfigs = await db.knex.from<Config>('_nango_configs').where({ environment_id: environment.id }).limit(opts.limit);

            for (const providerConfig of providerConfigs) {
                await deleteProviderConfigData(providerConfig, opts);
            }

            return providerConfigs.length;
        }
    });

    await batchDelete({
        ...opts,
        name: 'end_users < environment',
        deleteFn: async () => {
            const endUsers = await db.knex.from<DBEndUser>('end_users').where({ environment_id: environment.id }).limit(opts.limit);

            for (const endUser of endUsers) {
                await deleteEndUserData(endUser, opts);
            }

            return endUsers.length;
        }
    });

    await deleteExternalWebhooksByEnvironmentId(environment, opts);
    await deleteSlackNotificationsByEnvironmentId(environment, opts);
    await deleteEnvironmentVariablesByEnvironmentId(environment, opts);

    await environmentService.hardDelete(environment.id);
}

async function deleteExternalWebhooksByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all webhooks in environment...', environment.id, environment.name);

    await batchDelete({
        ...opts,
        name: 'external_webhooks < environment',
        deleteFn: async () => {
            const externalWebhooksDeletedCount = await db.knex
                .from<DBExternalWebhook>('_nango_external_webhooks')
                .where({ environment_id: environment.id })
                .limit(opts.limit)
                .delete();

            return externalWebhooksDeletedCount;
        }
    });
}

async function deleteSlackNotificationsByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all slack notifications in environment...', environment.id, environment.name);

    await batchDelete({
        ...opts,
        name: 'slack_notifications < environment',
        deleteFn: async () => {
            const slackNotifications = await db.knex
                .from<DBSlackNotification>('_nango_slack_notifications')
                .where({ environment_id: environment.id })
                .limit(opts.limit)
                .delete();

            return slackNotifications;
        }
    });
}

async function deleteEnvironmentVariablesByEnvironmentId(environment: DBEnvironment, opts: BatchDeleteSharedOptions) {
    const { logger } = opts;
    logger.info('Deleting all environment variables in environment...', environment.id, environment.name);

    await batchDelete({
        ...opts,
        name: 'environment_variables < environment',
        deleteFn: async () => {
            const environmentVariablesDeletedCount = await db.knex
                .from<DBEnvironmentVariable>('_nango_environment_variables')
                .where({ environment_id: environment.id })
                .limit(opts.limit)
                .delete();

            return environmentVariablesDeletedCount;
        }
    });
}
