import { Err, Ok } from '@nangohq/utils';

import { envs } from './env.js';
import { logger } from './logger.js';

import type { JobsClient } from '@nangohq/internal-clients/jobs';
import type { Result } from '@nangohq/utils';

export async function idle(jobsClient: JobsClient): Promise<Result<void>> {
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
