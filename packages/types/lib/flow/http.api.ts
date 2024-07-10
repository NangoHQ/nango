import type { ApiError, Endpoint } from '../api';
import type { IncomingFlowConfigUpgrade } from '../deploy/incomingFlow';

export type UpgradePreBuiltFlow = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/flow/upgrade/pre-built';
    Body: IncomingFlowConfigUpgrade;
    Error: ApiError<'error_creating_user'> | ApiError<'user_already_exists'> | ApiError<'error_creating_account'> | ApiError<'email_not_verified'>;
    Success: {
        success: true;
    };
}>;
