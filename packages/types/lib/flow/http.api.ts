import type { ApiError, Endpoint } from '../api';
import type { IncomingFlowConfigUpgrade, IncomingPreBuiltFlowConfig } from '../deploy/incomingFlow';

export type PutUpgradePreBuiltFlow = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/flow/pre-built/upgrade';
    Body: IncomingFlowConfigUpgrade;
    Error: ApiError<'upgrade_failed'>;
    Success: {
        success: true;
    };
}>;

export type PostPreBuiltDeploy = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/flow/pre-built/deploy';
    Body: { flow: IncomingPreBuiltFlowConfig };
    Error: ApiError<'unknown_provider'> | ApiError<'resource_capped'> | ApiError<'failed_to_deploy', Error[]>;
    Success: {
        data: {
            id: number;
        };
    };
}>;
