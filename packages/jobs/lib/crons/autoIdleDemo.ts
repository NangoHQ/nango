import { schedule } from 'node-cron';
import {
    CommandToActivityLog,
    ErrorSourceEnum,
    ScheduleStatus,
    SyncClient,
    SyncCommand,
    SyncConfig,
    createActivityLog,
    createActivityLogMessageAndEnd,
    db,
    errorManager,
    updateSuccess as updateSuccessActivityLog,
    updateScheduleStatus,
    isErr
} from '@nangohq/shared';
import tracer from 'dd-trace';

export async function cronAutoIdleDemo(): Promise<void> {
    schedule('*/1 * * * *', () => {
        const span = tracer.startSpan('cron.syncs.idleDemo');
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

interface ResQuery {
    id: string;
    name: string;
    environment_id: number;
    provider: string;
    connection_id: number;
    unique_key: string;
    schedule_id: string;
}
async function exec() {
    console.log('[autoidle] starting');

    const q = db.knex
        .queryBuilder()
        .withSchema(db.schema())
        .from<SyncConfig>('_nango_syncs')
        .select(
            '_nango_syncs.id',
            '_nango_syncs.name',
            '_nango_connections.environment_id',
            '_nango_configs.provider',
            '_nango_configs.unique_key',
            '_nango_connections.connection_id',
            '_nango_sync_schedules.schedule_id'
        )
        .join('_nango_connections', '_nango_connections.id', '_nango_syncs.nango_connection_id')
        .join('_nango_environments', '_nango_environments.id', '_nango_connections.environment_id')
        .join('_nango_configs', function () {
            this.on('_nango_configs.environment_id', '_nango_connections.environment_id').on(
                '_nango_configs.unique_key',
                '_nango_connections.provider_config_key'
            );
        })
        .join('_nango_sync_schedules', '_nango_sync_schedules.sync_id', '_nango_syncs.id')
        .where({
            '_nango_syncs.name': 'github-issues-lite',
            '_nango_environments.name': 'dev',
            '_nango_configs.unique_key': 'demo-github-integration',
            '_nango_configs.provider': 'github',
            '_nango_syncs.deleted': false,
            '_nango_sync_schedules.status': ScheduleStatus.RUNNING
        })
        .where(db.knex.raw("_nango_syncs.created_at <  NOW() - INTERVAL '25h'"));
    const syncs: ResQuery[] = await q;

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
            content: `Sync was updated with command: "${action}" for sync: ${sync.id}`
        });
        await updateSuccessActivityLog(activityLogId, true);
    }

    console.log(`[autoidle] done`);
}
