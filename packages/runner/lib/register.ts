import type { Result } from '@nangohq/utils';
import { Err, Ok, retryWithBackoff } from '@nangohq/utils';
import { envs, jobsServiceUrl } from './env.js';
import { httpFetch } from './utils.js';
import { setTimeout } from 'node:timers/promises';

export async function register(): Promise<Result<void>> {
    if (!envs.RUNNER_NODE_ID) {
        return Err('NODE_ID is not set');
    }
    if (!envs.RUNNER_URL) {
        return Err('RUNNER_URL is not set');
    }
    try {
        // In Render, network configuration can take up to 30 seconds to be applied to the service
        // so we need to wait for the runner to be reachable from the outside before registering
        const startTime = Date.now();
        const timeoutMs = 120_000;
        const waitMs = 1000;
        let isReachable = false;
        while (!isReachable && Date.now() - startTime < timeoutMs) {
            try {
                const res = await fetch(`${envs.RUNNER_URL}/health`);
                if (res.ok) {
                    isReachable = true;
                } else {
                    await setTimeout(waitMs);
                }
            } catch {
                await setTimeout(waitMs);
            }
        }
        if (!isReachable) {
            return Err(new Error(`Runner at ${envs.RUNNER_URL} is not reachable after ${timeoutMs}ms`));
        }
        await retryWithBackoff(
            async () => {
                return await httpFetch({
                    method: 'POST',
                    url: `${jobsServiceUrl}/runners/${envs.RUNNER_NODE_ID}/register`,
                    data: JSON.stringify({ url: envs.RUNNER_URL })
                });
            },
            {
                startingDelay: 1000,
                timeMultiple: 3,
                numOfAttempts: 5
            }
        );
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed to register runner', { cause: err }));
    }
}
