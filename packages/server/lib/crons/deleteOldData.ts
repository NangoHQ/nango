import tracer from 'dd-trace';
import * as cron from 'node-cron';

import db from '@nangohq/database';
import { deleteExpiredPrivateKeys } from '@nangohq/keystore';
import { getLocking } from '@nangohq/kvstore';
import { configService, connectionService, deleteExpiredInvitations, deleteJobsByDate, environmentService, getSoftDeletedSyncConfig } from '@nangohq/shared';
import { getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { deleteExpiredConnectSession } from '../services/connectSession.service.js';
import oauthSessionService from '../services/oauth-session.service.js';
import { batchDelete } from './utils/batchDelete.js';
import { deleteConnectionData } from './utils/deleteConnectionData.js';
import { deleteEnvironmentData } from './utils/deleteEnvironmentData.js';
import { deleteProviderConfigData } from './utils/deleteProviderConfigData.js';
import { deleteSyncConfigData } from './utils/deleteSyncConfigData.js';

import type { BatchDeleteSharedOptions } from './utils/batchDelete.js';
import type { Lock } from '@nangohq/kvstore';
import type { Config } from '@nangohq/shared';

const logger = getLogger('cron.deleteOldData');

const cronMinutes = envs.CRON_DELETE_OLD_DATA_EVERY_MIN;

const limit = envs.CRON_DELETE_OLD_JOBS_LIMIT;
const deleteJobsOlderThan = envs.CRON_DELETE_OLD_JOBS_MAX_DAYS;

const deleteConnectionSessionOlderThan = envs.CRON_DELETE_OLD_CONNECT_SESSION_MAX_DAYS;
const deletePrivateKeysOlderThan = envs.CRON_DELETE_OLD_PRIVATE_KEYS_MAX_DAYS;
const deleteOauthSessionOlderThan = envs.CRON_DELETE_OLD_OAUTH_SESSION_MAX_DAYS;
const deleteInvitationsOlderThan = envs.CRON_DELETE_OLD_INVITATIONS_MAX_DAYS;
const deleteConfigsOlderThan = envs.CRON_DELETE_OLD_CONFIGS_MAX_DAYS;
const deleteSyncConfigsOlderThan = envs.CRON_DELETE_OLD_SYNC_CONFIGS_MAX_DAYS;
const deleteConnectionsOlderThan = envs.CRON_DELETE_OLD_CONNECTIONS_MAX_DAYS;
const deleteEnvironmentsOlderThan = envs.CRON_DELETE_OLD_ENVIRONMENTS_MAX_DAYS;

export function deleteOldData(): void {
    if (envs.CRON_DELETE_OLD_DATA_EVERY_MIN <= 0) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const start = Date.now();
            try {
                await tracer.trace<Promise<void>>('nango.server.cron.deleteOldData', async () => {
                    await exec();
                });

                logger.info('✅ done');
            } catch (err) {
                report(new Error('cron_failed_to_hard_delete_old_data', { cause: err }));
            }
            metrics.duration(metrics.Types.JOBS_DELETE_OLD_DATA, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    logger.info(`Starting`);

    const ttlMs = cronMinutes * 60 * 1000 - 1000;
    const lockKey = `lock:deleteOldData:cron`;
    const deadline = new Date(Date.now() + ttlMs);
    let lock: Lock | undefined;
    try {
        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch (err) {
            logger.info(`Could not acquire lock, skipping`, err);
            return;
        }

        const opts: BatchDeleteSharedOptions = {
            deadline,
            limit,
            logger
        };

        // Delete jobs
        await batchDelete({
            ...opts,
            name: 'jobs',
            deleteFn: async () => await deleteJobsByDate({ olderThan: deleteJobsOlderThan, limit })
        });

        // Delete connect session
        await batchDelete({
            ...opts,
            name: 'connect session',
            deleteFn: async () => await deleteExpiredConnectSession(db.knex, { olderThan: deleteConnectionSessionOlderThan, limit })
        });

        // Delete private keys
        await batchDelete({
            ...opts,
            name: 'private keys',
            deleteFn: async () => await deleteExpiredPrivateKeys(db.knex, { olderThan: deletePrivateKeysOlderThan, limit })
        });

        // Delete oauth sessions
        await batchDelete({
            ...opts,
            name: 'oauth sessions',
            deleteFn: async () => await oauthSessionService.deleteExpiredSessions({ limit, olderThan: deleteOauthSessionOlderThan })
        });

        // Delete invitations
        await batchDelete({
            ...opts,
            name: 'invitations',
            deleteFn: async () => await deleteExpiredInvitations({ limit, olderThan: deleteInvitationsOlderThan })
        });

        // Delete integrations and all associated data
        await batchDelete({
            ...opts,
            name: 'integration',
            deleteFn: async () => {
                const integrations = await configService.getSoftDeleted({ limit, olderThan: deleteConfigsOlderThan });
                for (const integration of integrations) {
                    await deleteProviderConfigData(integration as Config, opts);
                }

                return integrations.length;
            }
        });

        // Delete sync configs and all associated data
        await batchDelete({
            ...opts,
            name: 'sync configs',
            deleteFn: async () => {
                const syncsConfigs = await getSoftDeletedSyncConfig({ limit, olderThan: deleteSyncConfigsOlderThan });

                for (const syncConfig of syncsConfigs) {
                    await deleteSyncConfigData(syncConfig, opts);
                }

                return syncsConfigs.length;
            }
        });

        // Delete connections and all associated data
        await batchDelete({
            ...opts,
            name: 'connections',
            deleteFn: async () => {
                const connections = await connectionService.getSoftDeleted({ limit, olderThan: deleteConnectionsOlderThan });

                for (const connection of connections) {
                    await deleteConnectionData(connection, opts);
                }

                return connections.length;
            }
        });

        await batchDelete({
            ...opts,
            name: 'environments',
            deleteFn: async () => {
                const environments = await environmentService.getSoftDeleted({ limit, olderThan: deleteEnvironmentsOlderThan });

                for (const environment of environments) {
                    await deleteEnvironmentData(environment, opts);
                }

                return environments.length;
            }
        });
    } finally {
        if (lock) {
            locking.release(lock);
        }
    }
}
