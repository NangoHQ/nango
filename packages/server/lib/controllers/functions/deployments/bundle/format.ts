import type { DeploymentBundlePreparationError, DeploymentBundleReconciliation } from '@nangohq/shared';
import type { FunctionDeploymentBundleSuccess, PostFunctionDeploymentBundlePreview } from '@nangohq/types';

export function toResponse(reconciliation: DeploymentBundleReconciliation): FunctionDeploymentBundleSuccess {
    return {
        created: reconciliation.created.map(({ integrationId, name }) => ({ integrationId, name })),
        updated: reconciliation.updated.map(({ integrationId, name }) => ({ integrationId, name })),
        unchanged: reconciliation.unchanged.map(({ integrationId, name }) => ({ integrationId, name })),
        deleted: reconciliation.deleted.map((current) => ({ integrationId: current.integration.unique_key, name: current.config.name }))
    };
}

export function toErrorResponse(error: DeploymentBundlePreparationError): {
    status: number;
    error: PostFunctionDeploymentBundlePreview['Errors'];
} {
    if (error.code === 'integration_not_found') {
        return {
            status: 400,
            error: {
                error: {
                    code: 'integration_not_found',
                    message: `Integration(s) not found: ${error.integrationIds.join(', ')}`
                }
            }
        };
    }

    return {
        status: 500,
        error: {
            error: {
                code: 'functions_deployment_error',
                message: 'Failed to deploy functions'
            }
        }
    };
}
