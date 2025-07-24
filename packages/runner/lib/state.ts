import { envs } from './env.js';
import { RunnerMonitor } from './monitor.js';
import { Locks } from './sdk/locks.js';

export const abortControllers = new Map<string, AbortController>();

export const usage = new RunnerMonitor({ runnerId: envs.RUNNER_NODE_ID });
export const locks = new Locks();
