import { Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskWebhook } from '@nangohq/nango-orchestrator';

export async function startWebhook(task: TaskWebhook): Promise<Result<void>> {
    console.log(task);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Ok(undefined);
}
