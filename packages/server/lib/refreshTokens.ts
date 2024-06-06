import * as cron from 'node-cron';
import db from '@nangohq/database';
import { errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics, stringToHash } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from './hooks/hooks.js';
import tracer from 'dd-trace';

const logger = getLogger('Server');
const cronName = '[refreshTokens]';

export function refreshTokens(): void {
    cron.schedule('*/10 * * * *', async () => {
        (async () => {
            const start = Date.now();
            try {
                await exec();
            } catch (err: unknown) {
                const e = new Error('failed_to_refresh_tokens', {
                    cause: err instanceof Error ? err.message : String(err)
                });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
            } finally {
                metrics.duration(metrics.Types.REFRESH_TOKENS, Date.now() - start);
            }
        })().catch((error: unknown) => {
            logger.error('Failed to execute refreshTokens cron job');
            logger.error(error);
        });
    });
}

export async function exec(): Promise<void> {
    logger.info(`${cronName} starting`);

    const lockKey = stringToHash(cronName);

    // Lock to prevent multiple instances of this cron job from running at the same time
    await db.knex.transaction(async (trx) => {
        const { rows } = await trx.raw<{ rows: { pg_try_advisory_xact_lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?);`, [lockKey]);
        if (!rows?.[0]?.pg_try_advisory_xact_lock) {
            logger.info(`${cronName} could not acquire lock, skipping`);
            return;
        }
        const staleConnections = await connectionService.getOldConnections({ days: 1, limit: 500 });

        logger.info(`${cronName} found ${staleConnections.length} stale connections`);

        for (const staleConnection of staleConnections) {
            const { connection_id, environment, provider_config_key, account } = staleConnection;

            logger.info(`${cronName} refreshing token for connectionId: ${connection_id}, accountId: ${account.id}`);

            try {
                const credentialResponse = await connectionService.getConnectionCredentials({
                    account,
                    environment,
                    connectionId: connection_id,
                    providerConfigKey: provider_config_key,
                    logContextGetter,
                    instantRefresh: false,
                    onRefreshSuccess: connectionRefreshSuccessHook,
                    onRefreshFailed: connectionRefreshFailedHook
                });
                if (credentialResponse.isOk()) {
                    metrics.increment(metrics.Types.REFRESH_TOKENS_SUCCESS);
                } else {
                    metrics.increment(metrics.Types.REFRESH_TOKENS_FAILED);
                }
            } catch (err) {
                logger.error(`${cronName} failed to refresh token for connectionId: ${connection_id} ${stringifyError(err)}`);
                metrics.increment(metrics.Types.REFRESH_TOKENS_FAILED);
            }
        }
    });

    logger.info(`${cronName} ✅ done`);
}
