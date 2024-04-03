import { schedule } from 'node-cron';
import {
    CommandToActivityLog,
    ErrorSourceEnum,
    SyncClient,
    SyncCommand,
    createActivityLog,
    createActivityLogMessageAndEnd,
    errorManager,
    updateSuccess as updateSuccessActivityLog,
    updateScheduleStatus,
    isErr,
    findPausableDemoSyncs,
    SpanTypes
} from '@nangohq/shared';
import { getLogger } from '@nangohq/utils/dist/logger.js';
import tracer from 'dd-trace';

const logger = getLogger('Jobs');

export function cronAutoIdleDemo(): void {
    schedule('1 * * * *', () => {
        const span = tracer.startSpan(SpanTypes.JOBS_IDLE_DEMO);
        tracer.scope().activate(span, async () => {
            try {
                await exec();
            } catch (err: unknown) {
                const e = new Error('failed_to_auto_idle_demo', { cause: err instanceof Error ? err.message : err });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }
            span.finish();
        });
    });
}

export async function exec(): Promise<void> {
    logger.info('[autoidle] starting');

    const syncs = await findPausableDemoSyncs();

    logger.info(`[autoidle] found ${syncs.length} syncs`);

    const action = CommandToActivityLog['PAUSE'];
    for (const sync of syncs) {
        const activityLogId = await createActivityLog({
            level: 'info',
            success: false,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: String(sync.connection_id),
            provider: sync.provider,
            provider_config_key: sync.unique_key,
            environment_id: sync.environment_id,
            operation_name: sync.name
        });
        if (!activityLogId) {
            continue;
        }

        const syncClient = await SyncClient.getInstance();
        if (!syncClient) {
            continue;
        }

        logger.info(`[autoidle] pausing ${sync.id}`);

        const resTemporal = await syncClient.runSyncCommand({
            scheduleId: sync.schedule_id,
            syncId: sync.id,
            command: SyncCommand.PAUSE,
            activityLogId: activityLogId,
            environmentId: sync.environment_id,
            providerConfigKey: sync.unique_key,
            connectionId: sync.connection_id,
            syncName: sync.name
        });
        if (isErr(resTemporal)) {
            continue;
        }

        const resDb = await updateScheduleStatus(sync.schedule_id, SyncCommand.PAUSE, activityLogId, sync.environment_id);
        if (isErr(resDb)) {
            continue;
        }

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id: sync.environment_id,
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `Demo sync was automatically paused after being idle for a day`
        });
        await updateSuccessActivityLog(activityLogId, true);
    }

    logger.info(`[autoidle] done`);
}
