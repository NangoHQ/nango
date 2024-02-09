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
    findPausableDemoSyncs
} from '@nangohq/shared';
import tracer from 'dd-trace';
import { SpanTypes } from '@nangohq/shared/lib/utils/metrics.manager';

export async function cronAutoIdleDemo(): Promise<void> {
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

async function exec(): Promise<void> {
    console.log('[autoidle] starting');

    const syncs = await findPausableDemoSyncs();

    console.log(`[autoidle] found ${syncs.length} syncs`);

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

        console.log('[autoidle] pausing', { sync });

        const resTemporal = await syncClient.runSyncCommand(sync.schedule_id, sync.id, SyncCommand.PAUSE, activityLogId, sync.environment_id);
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

    console.log(`[autoidle] done`);
}
