import type { ApiError, Endpoint } from '../api.js';
import type { Deployment, ImageType } from './index.js';

export type PostRollout = Endpoint<{
    Method: 'POST';
    Path: '/fleet/:fleetId/rollout';
    Body: {
        imageType?: ImageType;
        image: string;
    };
    Params: {
        fleetId: string;
    };
    Success: Deployment;
    Error: ApiError<'forbidden'> | ApiError<'rollout_failed'>;
}>;
