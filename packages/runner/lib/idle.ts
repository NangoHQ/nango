import type { Result } from '@nangohq/utils';
import { Err, Ok, retryWithBackoff } from '@nangohq/utils';
import { envs, jobsServiceUrl } from './env.js';
import { httpFetch } from './utils.js';

export async function idle(): Promise<Result<void>> {
    if (!envs.RUNNER_NODE_ID) {
        return Err('NODE_ID is not set');
    }
    try {
        await retryWithBackoff(
            async () => {
                return await httpFetch({
                    method: 'POST',
                    url: `${jobsServiceUrl}/runners/${envs.RUNNER_NODE_ID}/idle`
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
        return Err(new Error('failed to idle runner', { cause: err }));
    }
}
