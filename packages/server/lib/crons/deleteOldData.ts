import * as cron from 'node-cron';
import type { Sync } from '@nangohq/shared';
import {
    errorManager,
    ErrorSourceEnum,
    deleteJobsByDate,
    deleteExpiredInvitations,
    configService,
    connectionService,
    hardDeleteSync,
    hardDeleteSyncConfig,
    hardDeleteEndpoints,
    getSoftDeletedSyncConfig
} from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { setTimeout } from 'node:timers/promises';
import type { Lock } from '@nangohq/kvstore';
import { getLocking } from '@nangohq/kvstore';
import db from '@nangohq/database';
import { deleteExpiredPrivateKeys } from '@nangohq/keystore';
import { envs } from '../env.js';
import { deleteExpiredConnectSession } from '../services/connectSession.service.js';
import oauthSessionService from '../services/oauth-session.service.js';
import type { DBSyncConfig } from '@nangohq/types';
import { records } from '@nangohq/records';

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

export function deleteOldData(): void {
    if (envs.CRON_DELETE_OLD_DATA_EVERY_MIN === 0) {
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
                const e = new Error('failed_to_hard_delete_old_data', { cause: err instanceof Error ? err.message : err });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
            }
            metrics.duration(metrics.Types.JOBS_DELETE_OLD_DATA, Date.now() - start);
        }
    );
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    logger.info(`Starting`);

    const ttlMs = cronMinutes * 60 * 1000 - 1000;
    const startTimestamp = Date.now();
    const lockKey = `lock:deleteOldData:cron`;
    let lock: Lock | undefined;
    try {
        try {
            lock = await locking.acquire(lockKey, ttlMs);
        } catch (err) {
            logger.info(`Could not acquire lock, skipping`, err);
            return;
        }

        // Delete jobs
        await batchDelete({
            name: 'jobs',
            startTimestamp,
            ttlMs,
            deleteFn: async () => await deleteJobsByDate({ olderThan: deleteJobsOlderThan, limit })
        });

        // Delete connect session
        await batchDelete({
            name: 'connect session',
            startTimestamp,
            ttlMs,
            deleteFn: async () => await deleteExpiredConnectSession(db.knex, { olderThan: deleteConnectionSessionOlderThan, limit })
        });

        // Delete private keys
        await batchDelete({
            name: 'private keys',
            startTimestamp,
            ttlMs,
            deleteFn: async () => await deleteExpiredPrivateKeys(db.knex, { olderThan: deletePrivateKeysOlderThan, limit })
        });

        // Delete oauth sessions
        await batchDelete({
            name: 'oauth sessions',
            startTimestamp,
            ttlMs,
            deleteFn: async () => await oauthSessionService.deleteExpiredSessions({ limit, olderThan: deleteOauthSessionOlderThan })
        });

        // Delete invitations
        await batchDelete({
            name: 'invitations',
            startTimestamp,
            ttlMs,
            deleteFn: async () => await deleteExpiredInvitations({ limit, olderThan: deleteInvitationsOlderThan })
        });

        // Delete integrations and all associated data
        await batchDelete({
            name: 'integration',
            startTimestamp,
            ttlMs,
            deleteFn: async () => {
                const integrations = await configService.getSoftDeleted({ limit, olderThan: deleteConfigsOlderThan });
                for (const integration of integrations) {
                    logger.info('Deleting integration...', integration.id, integration.unique_key);

                    await batchDelete({
                        name: 'sync configs < integration',
                        startTimestamp,
                        ttlMs,
                        deleteFn: async () => {
                            const syncsConfigs = await db.knex
                                .from<DBSyncConfig>('_nango_sync_configs')
                                .select<DBSyncConfig[]>()
                                .where({ nango_config_id: integration.id! })
                                .limit(limit);

                            for (const syncConfig of syncsConfigs) {
                                await deleteSyncConfigData({ syncConfig, startTimestamp, ttlMs });
                            }

                            return syncsConfigs.length;
                        }
                    });

                    // Delete connections
                    await batchDelete({
                        name: 'connections < integration',
                        startTimestamp,
                        ttlMs,
                        deleteFn: async () => await connectionService.hardDeleteByIntegration({ limit, integrationId: integration.id! })
                    });

                    await configService.hardDelete(integration.id!);
                }

                return integrations.length;
            }
        });

        // Delete sync configs and all associated data
        await batchDelete({
            name: 'sync configs',
            startTimestamp,
            ttlMs,
            deleteFn: async () => {
                const syncsConfigs = await getSoftDeletedSyncConfig({ limit, olderThan: deleteSyncConfigsOlderThan });

                for (const syncConfig of syncsConfigs) {
                    await deleteSyncConfigData({ syncConfig, startTimestamp, ttlMs });
                }

                return syncsConfigs.length;
            }
        });

        // Delete connections and all associated data
        await batchDelete({
            name: 'connections',
            startTimestamp,
            ttlMs,
            deleteFn: async () => {
                const connections = await connectionService.getSoftDeleted({ limit, olderThan: deleteConnectionsOlderThan });

                for (const connection of connections) {
                    logger.info('Deleting connection...', connection.id, connection.connection_id);
                    const resSyncs = await db.knex
                        .select<
                            {
                                sync: Sync;
                                syncConfig: DBSyncConfig;
                            }[]
                        >(db.knex.raw('row_to_json(_nango_syncs.*) as sync'), db.knex.raw('row_to_json(_nango_sync_configs.*) as "syncConfig"'))
                        .from<Sync>('_nango_syncs')
                        .join('_nango_sync_configs', '_nango_sync_configs.id', '_nango_syncs.sync_config_id')
                        .where({ nango_connection_id: connection.id });
                    for (const res of resSyncs) {
                        await deleteSyncData({ ...res });
                    }

                    await connectionService.hardDelete(connection.id);
                }

                return connections.length;
            }
        });
    } finally {
        if (lock) {
            locking.release(lock);
        }
    }
}

async function batchDelete({
    name,
    deleteFn,
    startTimestamp,
    ttlMs
}: {
    name: string;
    deleteFn: () => Promise<number>;
    startTimestamp: number;
    ttlMs: number;
}) {
    while (true) {
        const deleted = await deleteFn();
        if (deleted) {
            logger.info(`Deleted ${deleted} ${name}`);
        }
        if (deleted < limit) {
            break;
        }
        if (Date.now() - startTimestamp > ttlMs) {
            logger.info(`Time limit reached, stopping`);
            return;
        }
        await setTimeout(1000);
    }
}

async function deleteSyncConfigData({ syncConfig, startTimestamp, ttlMs }: { syncConfig: DBSyncConfig; startTimestamp: number; ttlMs: number }) {
    logger.info('Deleting sync config...', syncConfig.id, syncConfig.sync_name);

    await batchDelete({
        name: 'syncs',
        startTimestamp,
        ttlMs,
        deleteFn: async () => {
            const syncs = await db.knex.from<Sync>('_nango_syncs').select<Sync[]>().where({ sync_config_id: syncConfig.id }).limit(limit);

            for (const sync of syncs) {
                await deleteSyncData({ sync, syncConfig });
            }

            return syncs.length;
        }
    });

    const delEndpoints = await hardDeleteEndpoints({ syncConfigId: syncConfig.id });
    if (delEndpoints) {
        logger.info('deleted', delEndpoints, 'endpoints');
    }

    // delete sync_config
    await hardDeleteSyncConfig(syncConfig.id);
}

async function deleteSyncData({ sync, syncConfig }: { sync: Sync; syncConfig: DBSyncConfig }) {
    logger.info('Deleting sync...', sync.id, sync.name);

    for (const model of syncConfig.models) {
        // delete records for each model
        const res = await records.deleteRecordsBySyncId({
            connectionId: sync.nango_connection_id,
            environmentId: syncConfig.environment_id,
            model,
            syncId: sync.id,
            limit: limit
        });
        if (res.totalDeletedRecords) {
            logger.info('deleted', res.totalDeletedRecords, 'records for model', model);
        }
    }

    // delete sync
    await hardDeleteSync(sync.id);
}
