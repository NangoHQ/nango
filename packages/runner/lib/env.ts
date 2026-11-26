import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ RUNNER_NODE_ID: true }));

export const syncConflictTtlMs = envs.RUNNER_HEARTBEAT_INTERVAL_MS * envs.RUNNER_SYNC_CONFLICT_HEARTBEAT_INTERVAL_MULTIPLIER;
