import type { Result } from '@nangohq/utils';
import { Err, Ok, isCloud } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';

export async function waitUntilHealthy({ url, timeoutMs }: { url: string; timeoutMs: number }): Promise<Result<void>> {
    const startTime = Date.now();
    const waitMs = 1000;
    const requiredSuccesses = isCloud ? 10 : 1;
    let successCount = 0;
    while (Date.now() - startTime < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                successCount++;
                if (successCount >= requiredSuccesses) {
                    return Ok(undefined);
                }
            } else {
                successCount = 0;
            }
            await setTimeout(waitMs);
        } catch {
            successCount = 0;
            await setTimeout(waitMs);
        }
    }
    return Err(new Error(`${url} is not reachable after ${timeoutMs}ms`));
}
