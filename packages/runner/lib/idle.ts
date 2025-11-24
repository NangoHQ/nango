import { Err, Ok } from '@nangohq/utils';

import { jobsClient } from './clients/jobs.js';
import { envs } from './env.js';
import { logger } from './logger.js';

import type { Result } from '@nangohq/utils';

export async function idle(): Promise<Result<void>> {
    if (envs.RUNNER_NODE_ID) {
        const res = await jobsClient.postIdle({ nodeId: envs.RUNNER_NODE_ID });
        if (res.isErr()) {
            return Err(res.error);
        }
    } else {
        logger.info(`No idle: RUNNER_NODE_ID not set`);
    }
    return Ok(undefined);
}
