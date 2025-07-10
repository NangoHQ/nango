import type { ApiError, Endpoint } from '../api.js';
import type { Deployment } from './index.js';

export type PostRollout = Endpoint<{
    Method: 'POST';
    Path: '/fleet/:fleetId/rollout';
    Body: {
        image: string;
    };
    Params: {
        fleetId: string;
    };
    Success: Deployment;
    Error: ApiError<'forbidden'> | ApiError<'rollout_failed'>;
}>;
