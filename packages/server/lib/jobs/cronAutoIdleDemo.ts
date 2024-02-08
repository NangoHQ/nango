import { schedule } from 'node-cron';
import { ErrorSourceEnum, LogActionEnum, SyncConfig, db, errorManager } from '@nangohq/shared';
import tracer from 'dd-trace';

export async function cronAutoIdleDemo(): Promise<void> {
    schedule('*/1 * * * *', () => {
        const span = tracer.startSpan('cron.syncs.idleDemo');
        tracer.scope().activate(span, async () => {
            try {
                await exec();
            } catch (err: unknown) {
                const e = new Error('failed_to_clean_activity_logs_table', { cause: err instanceof Error ? err.message : err });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }
            span.finish();
        });
    });
}

async function exec() {
    const res = await db.knex
        .withSchema(db.schema())
        .from<SyncConfig>('_nango_sync_configs')
        .select('_nango_sync_configs.id', '_nango_sync_configs.sync_name', '_nango_sync_configs.environment_id', '_nango_configs.provider')
        .join('_nango_environments', '_nango_environments.id', '_nango_sync_configs.environment_id')
        .join('_nango_configs', '_nango_configs.id', '_nango_sync_configs.nango_config_id')
        .where({
            '_nango_sync_configs.sync_name': 'github-issues-lite',
            '_nango_environments.name': 'dev',
            '_nango_configs.unique_key': 'demo-github-integration',
            '_nango_configs.provider': 'github',
            '_nango_sync_configs.deleted': false,
            '_nango_sync_configs.active': true
        });

    console.log(res);

    // await syncOrchestrator.runSyncCommand(environmentId, provider_config_key as string, syncNames as string[], SyncCommand.PAUSE, connection_id);
}
