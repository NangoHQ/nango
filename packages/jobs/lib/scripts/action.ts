import { Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskAction } from '@nangohq/nango-orchestrator';

export async function startAction(task: TaskAction): Promise<Result<void>> {
    console.log(task);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Ok(undefined);
}
