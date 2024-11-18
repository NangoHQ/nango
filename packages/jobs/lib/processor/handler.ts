import tracer from 'dd-trace';
import type { OrchestratorTask } from '@nangohq/nango-orchestrator';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { startSync, abortSync } from '../execution/sync.js';
import { startAction } from '../execution/action.js';
import { startWebhook } from '../execution/webhook.js';
import { startOnEvent } from '../execution/onEvent.js';

export async function handler(task: OrchestratorTask): Promise<Result<void>> {
    if (task.isSync()) {
        const span = tracer.startSpan('jobs.handler.sync');
        return await tracer.scope().activate(span, async () => {
            const res = await startSync(task);
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
    if (task.isOnEvent()) {
        const span = tracer.startSpan('jobs.handler.onEvent');
        return await tracer.scope().activate(span, async () => {
            const res = startOnEvent(task);
            span.finish();
            return res;
        });
    }
    return Err(`Unreachable`);
}
