import type { Endpoint, ApiError } from '../api.js';
import type { CommitHash, Deployment } from './index.js';

export type PostRollout = Endpoint<{
    Method: 'POST';
    Path: '/fleet/:fleetId/rollout';
    Body: {
        commitHash: CommitHash;
    };
    Success: Deployment;
    Error: ApiError<'forbidden'> | ApiError<'rollout_failed' | 'unknown_fleet'>;
}>;
