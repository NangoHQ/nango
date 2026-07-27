import type { ApiEndpoint, ApiError } from '../api.js';
import type { Deployment, ImageType } from './index.js';

export type PostRollout = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
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
