import { Err, Ok } from '@nangohq/utils';

import { jobsClient } from './clients/jobs.js';
import { envs } from './env.js';
import { logger } from './logger.js';

import type { Result } from '@nangohq/utils';

export async function idle(): Promise<Result<void>> {
    try {
        if (envs.RUNNER_NODE_ID) {
            await jobsClient.postIdle({ nodeId: envs.RUNNER_NODE_ID });
        } else {
            logger.info(`No idle: RUNNER_NODE_ID not set`);
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed to idle runner', { cause: err }));
    }
}
