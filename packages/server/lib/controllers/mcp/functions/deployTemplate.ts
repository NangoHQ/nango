import { makeAuditTarget } from '../../../audit.js';
import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deployTemplateServiceErrorToMcp } from './errors.js';
import { deploymentCreateOutputSchema, deployTemplateArgumentsSchema } from './schema.js';

import type { DeploymentCreateOutput } from './schema.js';

export const deployTemplateTool = defineManagementMcpTool<typeof deployTemplateArgumentsSchema, DeploymentCreateOutput>({
    name: 'deploy_template',
    description: 'Deploy a function template and return its completed deployment job.',
    inputSchema: deployTemplateArgumentsSchema,
    outputSchema: deploymentCreateOutputSchema,
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
        targetFromOutput: ({ args }) => makeAuditTarget('function', args.template)
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, account, environment, plan }) {
        return (
            await functionDeploymentService.deployTemplate({
                account,
                environment,
                plan,
                body: { type: 'template', ...args }
            })
        ).mapError((error) => deployTemplateServiceErrorToMcp(error));
    }
});
