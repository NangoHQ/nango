import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import type { Lock } from '@nangohq/kvstore';
import { getLogger, report } from '@nangohq/utils';

const logger = getLogger('cron.aggregateHealthMetrics');
const cronMinutes = 15;

export function aggregateHealthMetrics(): void {
    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            const ttlMs = cronMinutes * 60 * 1000 - 1000;
            const locking = await getLocking();
            let lock: Lock | undefined;

            try {
                try {
                    lock = await locking.acquire('lock:aggregateHealthMetrics:cron', ttlMs);
                } catch (err) {
                    logger.info('Could not acquire lock, skipping health metrics aggregation');
                    return;
                }

                logger.info(`Starting health metrics aggregation`);

                const query = `
                    WITH RECURSIVE latest_events AS (
                        SELECT
                            environment_id,
                            integration_id,
                            connection_id,
                            provider,
                            COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success_count_24h,
                            COUNT(*) FILTER (WHERE status = 'FAILURE') AS failure_count_24h,
                            MAX(CASE WHEN status = 'SUCCESS' THEN created_at ELSE NULL END) AS last_success_at,
                            MAX(CASE WHEN status = 'FAILURE' THEN created_at ELSE NULL END) AS last_failure_at,
                            AVG(duration_ms) AS avg_runtime_ms,
                            SUM(COALESCE(api_calls_count, 0)) AS api_calls_24h,
                            MODE() WITHIN GROUP (ORDER BY error_type) AS top_error_type
                        FROM execution_events
                        WHERE created_at >= NOW() - INTERVAL '24 HOURS'
                        GROUP BY environment_id, integration_id, connection_id, provider
                    )
                    INSERT INTO integration_health_metrics (
                        environment_id,
                        integration_id,
                        connection_id,
                        provider,
                        status,
                        last_success_at,
                        last_failure_at,
                        success_count_24h,
                        failure_count_24h,
                        avg_runtime_ms,
                        api_calls_24h,
                        top_error_type,
                        updated_at
                    )
                    SELECT
                        environment_id,
                        integration_id,
                        connection_id,
                        provider,
                        CASE 
                            WHEN failure_count_24h > 0 AND success_count_24h = 0 THEN 'FAILING'
                            WHEN failure_count_24h > 0 AND success_count_24h > 0 AND (failure_count_24h::FLOAT / (success_count_24h + failure_count_24h)) > 0.1 THEN 'DEGRADED'
                            ELSE 'HEALTHY'
                        END as status,
                        last_success_at,
                        last_failure_at,
                        success_count_24h,
                        failure_count_24h,
                        avg_runtime_ms,
                        api_calls_24h,
                        top_error_type,
                        NOW()
                    FROM latest_events
                    ON CONFLICT (environment_id, integration_id, connection_id)
                    DO UPDATE SET
                        status = EXCLUDED.status,
                        last_success_at = EXCLUDED.last_success_at,
                        last_failure_at = EXCLUDED.last_failure_at,
                        success_count_24h = EXCLUDED.success_count_24h,
                        failure_count_24h = EXCLUDED.failure_count_24h,
                        avg_runtime_ms = EXCLUDED.avg_runtime_ms,
                        api_calls_24h = EXCLUDED.api_calls_24h,
                        top_error_type = EXCLUDED.top_error_type,
                        updated_at = EXCLUDED.updated_at;
                `;

                await db.knex.raw(query);

                logger.info(`✅ Aggregation completed`);
            } catch (err) {
                report(new Error('cron_failed_to_aggregate_health_metrics', { cause: err }));
            } finally {
                if (lock) {
                    locking.release(lock);
                }
            }
        },
        { runOnInit: true }
    );
}
