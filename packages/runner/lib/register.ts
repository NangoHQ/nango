import type { Result } from '@nangohq/utils';
import { Err, Ok, retryWithBackoff } from '@nangohq/utils';
import { envs, jobsServiceUrl } from './env.js';
import { httpFetch } from './utils.js';

export async function register({ port }: { port: number }): Promise<Result<void>> {
    if (!envs.RUNNER_NODE_ID) {
        return Err('NODE_ID is not set');
    }
    const nodeUrl = `http://localhost:${port}`;
    if (envs.RUNNER_TYPE === 'RENDER') {
        // TODO
    }
    try {
        await retryWithBackoff(
            () => {
                httpFetch({
                    method: 'POST',
                    url: `${jobsServiceUrl}/runners/${envs.RUNNER_NODE_ID}/register`,
                    data: JSON.stringify({ url: nodeUrl })
                });
            },
            {
                startingDelay: 1000,
                timeMultiple: 3,
                numOfAttempts: 5
            }
        );
        return Ok(undefined);
    } catch (err: unknown) {
        return Err(new Error('failed to register runner', { cause: err }));
    }
}
