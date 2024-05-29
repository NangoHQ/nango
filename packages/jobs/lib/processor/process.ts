import type { OrchestratorTask, TaskWebhook, TaskAction } from '@nangohq/nango-orchestrator';
import type { JsonValue } from 'type-fest';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

export async function process(task: OrchestratorTask): Promise<Result<JsonValue>> {
    task.abortController.signal.onabort = () => {
        abort(task);
    };
    if (task.isAction()) {
        return action(task);
    }
    if (task.isWebhook()) {
        return webhook(task);
    }
    return Err(`Unreachable`);
}

async function abort(_task: OrchestratorTask): Promise<Result<void>> {
    // TODO: Implement abort processing
    return Ok(undefined);
}

async function action(task: TaskAction): Promise<Result<JsonValue>> {
    // TODO: Implement action processing
    // Returning a successful result for now
    return Ok({ taskId: task.id, dryrun: true });
}

async function webhook(task: TaskWebhook): Promise<Result<JsonValue>> {
    // TODO: Implement action processing
    // Returning an error for now
    return Err(`Not implemented: ${JSON.stringify({ taskId: task.id })}`);
}
