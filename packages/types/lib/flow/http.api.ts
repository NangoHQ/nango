import type { ApiError, Endpoint } from '../api';
import type { IncomingFlowConfigUpgrade } from '../deploy/incomingFlow';

export type UpgradePreBuiltFlow = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/flow/upgrade/pre-built';
    Body: IncomingFlowConfigUpgrade;
    Error: ApiError<'upgrade_failed'>;
    Success: {
        success: true;
    };
}>;
