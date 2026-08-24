import { makeAuditTarget } from '../../../audit.js';
import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deployFunctionServiceErrorToMcp } from './errors.js';
import { deployFunctionArgumentsSchema, deploymentCreateOutputSchema } from './schema.js';

import type { DeploymentCreateOutput } from './schema.js';

export const deployFunctionTool = defineManagementMcpTool<typeof deployFunctionArgumentsSchema, DeploymentCreateOutput>({
    name: 'deploy_function',
    description:
        'Start a code function deployment and return its initial job status. This tool does not wait for completion; use get_deployment_status to retrieve the final status.',
    inputSchema: deployFunctionArgumentsSchema,
    outputSchema: deploymentCreateOutputSchema,
    requiredScopes: { every: ['environment:deploy'] },
    audit: {
        kind: 'audit',
        resource: 'function',
        action: 'deployed',
        scope: 'environment',
        metadata: ({ args }) => ({ providerConfigKey: args.integration_id, type: args.function_type }),
        targetFromOutput: ({ args }) => makeAuditTarget('function', args.function_name)
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, environment, customerApiKeyId }) {
        return (
            await functionDeploymentService.deployFunction({
                environment,
                body: { type: 'function', ...args },
                ...(customerApiKeyId ? { parentCustomerApiKeyId: customerApiKeyId } : {})
            })
        ).mapError((error) => deployFunctionServiceErrorToMcp(error));
    }
});
