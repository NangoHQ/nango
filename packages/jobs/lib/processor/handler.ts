import tracer from 'dd-trace';
import type { OrchestratorTask } from '@nangohq/nango-orchestrator';
import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { startSync, abortSync } from '../scripts/sync.js';
import { startAction } from '../scripts/action.js';
import { startWebhook } from '../scripts/webhook.js';
import { startPostConnection } from '../scripts/postConnection.js';

export async function handler(task: OrchestratorTask): Promise<Result<void>> {
    if (task.isSync()) {
        const span = tracer.startSpan('jobs.handler.sync');
        return await tracer.scope().activate(span, async () => {
            const start = Date.now();
            const res = await startSync(task);
            if (res.isErr()) {
                metrics.increment(metrics.Types.SYNC_FAILURE);
            } else {
                metrics.increment(metrics.Types.SYNC_SUCCESS);
                metrics.duration(metrics.Types.SYNC_TRACK_RUNTIME, Date.now() - start);
            }
            span.finish();
            return res.isErr() ? Err(res.error) : Ok(undefined);
        });
    }
    if (task.isSyncAbort()) {
        const span = tracer.startSpan('jobs.handler.abort');
        return await tracer.scope().activate(span, async () => {
            const res = await abortSync(task);
            span.finish();
            return res;
        });
    }
    if (task.isAction()) {
        const span = tracer.startSpan('jobs.handler.action');
        return await tracer.scope().activate(span, async () => {
            const res = await startAction(task);
            span.finish();
            return res;
        });
    }
    if (task.isWebhook()) {
        const span = tracer.startSpan('jobs.handler.webhook');
        return await tracer.scope().activate(span, async () => {
            const res = startWebhook(task);
            span.finish();
            return res;
        });
    }
    if (task.isPostConnection()) {
        const span = tracer.startSpan('jobs.handler.postConnection');
        return await tracer.scope().activate(span, async () => {
            const res = startPostConnection(task);
            span.finish();
            return res;
        });
    }
    return Err(`Unreachable`);
}
