import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import { envs } from './env.js';
import { jobsClient } from './clients/jobs.js';
import { logger } from './logger.js';

export async function register(): Promise<Result<void>> {
    try {
        if (envs.RUNNER_NODE_ID && envs.RUNNER_URL) {
            await jobsClient.postRegister({ nodeId: envs.RUNNER_NODE_ID, url: envs.RUNNER_URL });
        } else {
            logger.info(`No registration: RUNNER_NODE_ID or RUNNER_URL not set`);
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed to register runner', { cause: err }));
    }
}
