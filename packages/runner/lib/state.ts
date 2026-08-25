import { envs } from './env.js';
import { RunnerMonitor } from './monitor.js';

export const abortControllers = new Map<string, AbortController>();

export const distributedCoordination = envs.RUNNER_CONFLICT_RESOLUTION_MODE === 'DISTRIBUTED';

export const usage = new RunnerMonitor({
    runnerId: envs.RUNNER_NODE_ID
});
