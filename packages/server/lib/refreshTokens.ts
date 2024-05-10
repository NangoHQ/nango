import * as cron from 'node-cron';
import { db, errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { logContextGetter } from '@nangohq/logs';

const logger = getLogger('Server');

export function refreshTokens(): void {
    cron.schedule('*/45 * * * *', async () => {
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
    logger.info('[refreshTokens] starting');

    const today = new Date();
    const lockKey = parseInt(`${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}`);

    // Lock to prevent multiple instances of this cron job from running at the same time
    await db.knex.transaction(async (trx) => {
        const { rows } = await trx.raw<{ rows: { pg_try_advisory_xact_lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?);`, [lockKey]);
        if (!rows?.[0]?.pg_try_advisory_xact_lock) {
            logger.info(`[refreshTokens] could not acquire lock, skipping`);
            return;
        }
        const staleConnections = await connectionService.getOldConnections({ days: 1, limit: 250 });

        logger.info(`[refreshTokens] found ${staleConnections.length} stale connections`);

        for (const staleConnection of staleConnections) {
            const { connection_id, environment_id, provider_config_key, account_id } = staleConnection;

            logger.info(`[refreshTokens] refreshing token for connectionId: ${connection_id}, accountId: ${account_id}`);

            try {
                await connectionService.getConnectionCredentials(account_id, environment_id, connection_id, provider_config_key, logContextGetter);
                metrics.increment(metrics.Types.REFRESH_TOKENS_SUCCESS);
            } catch (err) {
                logger.error(`[refreshTokens] failed to refresh token for connectionId: ${connection_id} ${stringifyError(err)}`);
                metrics.increment(metrics.Types.REFRESH_TOKENS_FAILED);
            }
        }
    });

    logger.info('[refreshTokens] ✅ done');
}
