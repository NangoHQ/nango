import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';

export async function waithUntilHealthy({ url, timeoutMs }: { url: string; timeoutMs: number }): Promise<Result<void>> {
    const startTime = Date.now();
    const waitMs = 1000;
    while (Date.now() - startTime < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                return Ok(undefined);
            } else {
                await setTimeout(waitMs);
            }
        } catch {
            await setTimeout(waitMs);
        }
    }
    return Err(new Error(`${url} is not reachable after ${timeoutMs}ms`));
}
