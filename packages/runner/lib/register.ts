import { Err, Ok } from '@nangohq/utils';

import { jobsClient } from './clients/jobs.js';
import { envs } from './env.js';
import { logger } from './logger.js';

import type { Result } from '@nangohq/utils';

export async function register(): Promise<Result<void>> {
    if (envs.RUNNER_NODE_ID && envs.RUNNER_URL) {
        const res = await jobsClient.postRegister({ nodeId: envs.RUNNER_NODE_ID, url: envs.RUNNER_URL });
        if (res.isErr()) {
            return Err(res.error);
        }
    } else {
        logger.info(`No registration: RUNNER_NODE_ID or RUNNER_URL not set`);
    }
    return Ok(undefined);
}
