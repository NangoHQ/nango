import { Ok, retryWithBackoff } from '@nangohq/utils';

import type { Node } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';

export async function onFinishing(node: Node): Promise<Result<void>> {
    const res = await retryWithBackoff(
        async () => {
            return await fetch(`${node.url}/notifyWhenIdle`, { method: 'POST', body: JSON.stringify({ nodeId: node.id }) });
        },
        {
            numOfAttempts: 5
        }
    );
    if (!res.ok) {
        throw new Error(`status: ${res.status}. response: ${res.statusText}`);
    }
    return Ok(undefined);
}
