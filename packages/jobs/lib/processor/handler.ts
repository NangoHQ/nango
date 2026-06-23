import tracer from 'dd-trace';

import { getFlags } from '@nangohq/feature-flags';
import { Err, Ok } from '@nangohq/utils';

import { startAction } from '../execution/action.js';
import { startOnEvent } from '../execution/onEvent.js';
import { abortTask } from '../execution/operations/abort.js';
import { abortSync, startSync } from '../execution/sync.js';
import { startWebhook } from '../execution/webhook.js';

import type { OrchestratorTask } from '@nangohq/nango-orchestrator';
import type { Result } from '@nangohq/utils';

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
        return tracer.trace(
            'jobs.handler.action',
            {
                tags: {
                    'task.id': task.id,
                    'action.name': task.actionName,
                    'connection.id': task.connection.connection_id,
                    'environment.id': task.connection.environment_id
                }
            },
            async (span) => {
                if (await getFlags().shouldKeepActionTrace(task.connection.environment_id)) {
                    span?.setTag('manual.keep', true);
                }
                return startAction(task);
            }
        );
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
    if (task.isAbort()) {
        const span = tracer.startSpan('jobs.handler.abort');
        return await tracer.scope().activate(span, async () => {
            const res = await abortTask(task);
            span.finish();
            return res;
        });
    }
    return Err(`Unreachable`);
}
