import { Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskPostConnection } from '@nangohq/nango-orchestrator';

export async function startPostConnection(task: TaskPostConnection): Promise<Result<void>> {
    console.log(task);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Ok(undefined);
}
