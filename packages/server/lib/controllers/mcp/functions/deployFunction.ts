import { makeAuditTarget } from '../../../audit.js';
import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deployFunctionServiceErrorToMcp } from './errors.js';
import { deployFunctionArgumentsSchema, deploymentCreateOutputSchema } from './schema.js';

import type { DeploymentCreateOutput } from './schema.js';

export const deployFunctionTool = defineManagementMcpTool<typeof deployFunctionArgumentsSchema, DeploymentCreateOutput>({
    name: 'deploy_function',
    title: 'Deploy Function',
    description:
        'Starts a code function deployment and returns its initial job status. The tool does not wait for completion; get_deployment_status returns the final status.',
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
        openWorldHint: true
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
