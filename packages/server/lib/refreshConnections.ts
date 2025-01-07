import * as cron from 'node-cron';
import type { Lock } from '@nangohq/shared';
import { errorManager, ErrorSourceEnum, connectionService, locking } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import {
    connectionRefreshFailed as connectionRefreshFailedHook,
    connectionRefreshSuccess as connectionRefreshSuccessHook,
    connectionTest as connectionTestHook
} from './hooks/hooks.js';
import tracer from 'dd-trace';

const logger = getLogger('Server');
const cronName = '[refreshConnections]';
const cronMinutes = 10;

export function refreshConnectionsCron(): void {
    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            const start = Date.now();
            try {
                await exec();
            } catch (err) {
                const e = new Error('failed_to_refresh_connections', {
                    cause: err instanceof Error ? err.message : String(err)
                });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
            } finally {
                metrics.duration(metrics.Types.REFRESH_CONNECTIONS, Date.now() - start);
            }
        })().catch((err: unknown) => {
            logger.error('Failed to execute refreshConnections cron job');
            logger.error(err);
        });
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.server.cron.refreshConnections', async (span) => {
        let lock: Lock | undefined;
        try {
            logger.info(`${cronName} starting`);

            const ttlMs = cronMinutes * 60 * 1000;
            const startTimestamp = Date.now();
            const lockKey = `lock:connectionCheck:cron`;

            try {
                lock = await locking.acquire(lockKey, ttlMs);
            } catch {
                logger.info(`${cronName} could not acquire lock, skipping`);
                return;
            }

            let cursor = undefined;
            const limit = 1000;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const staleConnections = await connectionService.getStaleConnections({ days: 1, limit, cursor });
                logger.info(`${cronName} found ${staleConnections.length} stale connections`);
                for (const staleConnection of staleConnections) {
                    if (Date.now() - startTimestamp > ttlMs) {
                        logger.info(`${cronName} time limit reached, stopping`);
                        return;
                    }

                    const { connection, account, environment, integration } = staleConnection;
                    logger.info(`${cronName} refreshing connection '${connection.connection_id}' for accountId '${account.id}'`);
                    try {
                        const credentialResponse = await connectionService.refreshOrTestCredentials({
                            account,
                            environment,
                            integration,
                            connection,
                            logContextGetter,
                            instantRefresh: false,
                            onRefreshSuccess: connectionRefreshSuccessHook,
                            onRefreshFailed: connectionRefreshFailedHook,
                            connectionTestHook
                        });
                        if (credentialResponse.isOk()) {
                            metrics.increment(metrics.Types.REFRESH_CONNECTIONS_SUCCESS);
                        } else {
                            metrics.increment(metrics.Types.REFRESH_CONNECTIONS_FAILED);
                        }
                    } catch (err) {
                        logger.error(`${cronName} failed to refresh connection '${connection.connection_id}' ${stringifyError(err)}`);
                        metrics.increment(metrics.Types.REFRESH_CONNECTIONS_FAILED);
                    }
                    cursor = staleConnection.cursor;
                }
                if (staleConnections.length < limit) {
                    break;
                }
            }

            logger.info(`${cronName} ✅ done`);
        } catch (err) {
            logger.error(`${cronName} failed: ${stringifyError(err)}`);
            span.setTag('error', err);
        } finally {
            if (lock) {
                locking.release(lock);
            }
        }
    });
}
