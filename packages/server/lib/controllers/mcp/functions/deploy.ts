import { makeAuditTarget } from '../../../audit.js';
import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deployFunctionServiceErrorToMcp, deployTemplateServiceErrorToMcp } from './errors.js';
import { deployFunctionsArgumentsSchema, deployFunctionsOutputSchema, toFunctionDeploymentBody } from './schema.js';

import type { DeployFunctionsOutput } from './schema.js';

export const deployFunctionsTool = defineManagementMcpTool<typeof deployFunctionsArgumentsSchema, DeployFunctionsOutput>({
    name: 'functions_deploy',
    description:
        'Start a code or template function deployment and return its initial job status. This tool does not wait for completion; use functions_get_deployment to retrieve the final status.',
    inputSchema: deployFunctionsArgumentsSchema,
    outputSchema: deployFunctionsOutputSchema,
    requiredScopes: { every: ['environment:deploy'] },
    audit: {
        kind: 'audit',
        resource: 'function',
        action: 'deployed',
        scope: 'environment',
        metadata: ({ args }) => ({
            providerConfigKey: args.integration_id,
            ...(args.function_type ? { type: args.function_type } : {})
        }),
        targetFromOutput: ({ args }) => makeAuditTarget('function', args.type === 'function' ? args.function_name : args.template)
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, account, environment, plan, customerApiKeyId }) {
        const body = toFunctionDeploymentBody(args);
        if (body.type === 'template') {
            return (await functionDeploymentService.deployTemplate({ account, environment, plan, body })).mapError((error) =>
                deployTemplateServiceErrorToMcp(error)
            );
        }

        return (
            await functionDeploymentService.deployFunction({
                environment,
                body,
                ...(customerApiKeyId ? { parentCustomerApiKeyId: customerApiKeyId } : {})
            })
        ).mapError((error) => deployFunctionServiceErrorToMcp(error));
    }
});
