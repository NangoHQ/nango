import { schedule } from 'node-cron';
import { ErrorSourceEnum, SyncCommand, errorManager, findDemoSyncs, SpanTypes, getOrchestratorUrl, Orchestrator } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import tracer from 'dd-trace';
import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import { OrchestratorClient } from '@nangohq/nango-orchestrator';

const logger = getLogger('Jobs');
const orchestrator = new Orchestrator(new OrchestratorClient({ baseUrl: getOrchestratorUrl() }));

export function cronAutoIdleDemo(): void {
    schedule('1 * * * *', () => {
        const span = tracer.startSpan(SpanTypes.JOBS_IDLE_DEMO);
        void tracer.scope().activate(span, async () => {
            try {
                await exec({ orchestrator });
            } catch (err: unknown) {
                const e = new Error('failed_to_auto_idle_demo', { cause: err instanceof Error ? err.message : err });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }
            span.finish();
        });
    });
}

export async function exec({ orchestrator }: { orchestrator: Orchestrator }): Promise<void> {
    logger.info('[autoidle] starting');

    const syncs = await findDemoSyncs();

    const scheduleProps = syncs.map((sync) => {
        return { syncId: sync.id, environmentId: sync.environment_id };
    });
    const schedules = await orchestrator.searchSchedules(scheduleProps);
    if (schedules.isErr()) {
        logger.error(`[autoidle] error getting schedules: ${schedules.error}`);
        return;
    }

    for (const sync of syncs) {
        const schedule = schedules.value.get(sync.id);
        if (schedule?.state !== 'STARTED') {
            continue;
        }
        const logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'pause' } },
            {
                account: { id: sync.account_id, name: sync.account_name },
                environment: { id: sync.environment_id, name: sync.environment_name },
                integration: { id: sync.config_id, name: sync.provider_unique_key, provider: sync.provider },
                connection: { id: sync.connection_unique_id, name: sync.connection_id },
                syncConfig: { id: sync.sync_config_id, name: sync.name }
            }
        );

        logger.info(`[autoidle] pausing ${sync.id}`);

        const res = await orchestrator.runSyncCommand({
            connectionId: sync.connection_unique_id,
            syncId: sync.id,
            command: SyncCommand.PAUSE,
            environmentId: sync.environment_id,
            logCtx,
            recordsService,
            initiator: 'auto_idle_demo'
        });
        if (res.isErr()) {
            await logCtx.failed();
            continue;
        }

        await logCtx.info('Demo sync was automatically paused after being idle for a day');
        await logCtx.success();
    }

    logger.info(`[autoidle] done`);
}
