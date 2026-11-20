import { envs } from './env.js';

export const abortControllers = new Map<string, AbortController>();

export const distributedCoordination = envs.RUNNER_CONFLICT_RESOLUTION_MODE === 'DISTRIBUTED';
