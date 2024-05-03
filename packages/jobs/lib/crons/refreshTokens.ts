import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { logContextGetter } from '@nangohq/logs';

const logger = getLogger('Jobs');

export function refreshTokens(): void {
    //cron.schedule('0 6 * * *', () => {
    cron.schedule('* * * * *', () => {
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

    const staleConnections = await connectionService.getOldConnections({ days: 7, limit: 500 });

    logger.info(`[refreshTokens] found ${staleConnections.length} stale connections`);

    for (const staleConnection of staleConnections) {
        const { connection_id, environment_id, provider_config_key, account_id } = staleConnection;

        if (typeof account_id !== 'number') {
            logger.error(`[refreshTokens] connectionId: ${connection_id} is missing account_id`);
            continue;
        }

        logger.info(`[refreshTokens] refreshing token for connectionId: ${connection_id}, accountId: ${account_id}`);

        try {
            await connectionService.getConnectionCredentials(account_id, environment_id, connection_id, provider_config_key, logContextGetter);
            metrics.increment(metrics.Types.REFRESH_TOKENS_SUCCESS);
        } catch (err) {
            logger.error(`[refreshTokens] failed to refresh token for connectionId: ${connection_id}`);
            logger.error(err);
            metrics.increment(metrics.Types.REFRESH_TOKENS_FAILED);
        }
    }

    logger.info('[refreshTokens] ✅ done');
}
