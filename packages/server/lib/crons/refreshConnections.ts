import tracer from 'dd-trace';
import * as cron from 'node-cron';

import { getLocking } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { connectionService, encryptionManager, refreshOrTestCredentials } from '@nangohq/shared';
import { getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';
import {
    connectionRefreshFailed as connectionRefreshFailedHook,
    connectionRefreshSuccess as connectionRefreshSuccessHook,
    testConnectionCredentials as connectionTestHook
} from '../hooks/hooks.js';

import type { Lock } from '@nangohq/kvstore';

const logger = getLogger('cron.refreshConnection');
const cronMinutes = envs.CRON_REFRESH_CONNECTIONS_EVERY_MIN;
const limit = envs.CRON_REFRESH_CONNECTIONS_LIMIT;

export function refreshConnectionsCron(): void {
    // set env var CRON_REFRESH_CONNECTIONS_EVERY_MIN to 0 to disable
    if (cronMinutes <= 0) {
        return;
    }

    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            const start = Date.now();
            try {
                await exec();
            } catch (err) {
                report(new Error('cron_failed_to_refresh_connections', { cause: err }));
            } finally {
                metrics.duration(metrics.Types.CRON_REFRESH_CONNECTIONS, Date.now() - start);
                logger.info('✅ done');
            }
        })().catch((err: unknown) => {
            logger.error('Failed to execute refreshConnections cron job');
            report(new Error('cron_failed_to_refresh_connections', { cause: err }));
        });
    });
}

export async function exec(): Promise<void> {
    const locking = await getLocking();

    await tracer.trace<Promise<void>>('nango.server.cron.refreshConnections', async (span) => {
        let lock: Lock | undefined;
        try {
            logger.info(`Starting`);

            const ttlMs = cronMinutes * 60 * 1000;
            const startTimestamp = Date.now();
            const lockKey = `lock:connectionCheck:cron`;

            try {
                lock = await locking.acquire(lockKey, ttlMs);
            } catch {
                logger.info(`Could not acquire lock, skipping`);
                return;
            }

            let cursor = undefined;
            while (true) {
                const staleConnections = await connectionService.getStaleConnections({ days: 1, limit, cursor });
                logger.info(`Found ${staleConnections.length} stale connections`);
                for (const staleConnection of staleConnections) {
                    if (Date.now() - startTimestamp > ttlMs) {
                        logger.info(`Time limit reached, stopping`);
                        return;
                    }

                    const { connection, account, environment, integration } = staleConnection;

                    const decryptedConnection = encryptionManager.decryptConnection(connection);
                    if (!decryptedConnection) {
                        logger.error(`Failed to decrypt stale connection '${connection.id}'`);
                        continue;
                    }

                    const decryptedIntegration = encryptionManager.decryptProviderConfig(integration);
                    if (!decryptedIntegration) {
                        logger.error(`Failed to decrypt integration '${integration.id} for stale connection '${connection.id}'`);
                        continue;
                    }

                    try {
                        const credentialResponse = await refreshOrTestCredentials({
                            account,
                            environment,
                            integration: decryptedIntegration,
                            connection: decryptedConnection,
                            logContextGetter,
                            instantRefresh: false,
                            onRefreshSuccess: connectionRefreshSuccessHook,
                            onRefreshFailed: connectionRefreshFailedHook,
                            connectionTestHook
                        });
                        if (credentialResponse.isOk()) {
                            metrics.increment(metrics.Types.CRON_REFRESH_CONNECTIONS_SUCCESS);
                        } else {
                            metrics.increment(metrics.Types.CRON_REFRESH_CONNECTIONS_FAILED);
                        }
                    } catch (err) {
                        report(new Error('cron_failed_to_refresh_connection', { cause: err }));
                        metrics.increment(metrics.Types.CRON_REFRESH_CONNECTIONS_FAILED);
                    }
                    cursor = staleConnection.cursor;
                }
                if (staleConnections.length < limit) {
                    break;
                }
            }
        } catch (err) {
            report(new Error('cron_failed_to_refresh_connections', { cause: err }));
            span.setTag('error', err);
        } finally {
            if (lock) {
                locking.release(lock);
            }
        }
    });
}
