import { makeAuditTarget } from '../../../audit.js';
import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deployTemplateServiceErrorToMcp } from './errors.js';
import { deploymentCreateOutputSchema, deployTemplateArgumentsSchema } from './schema.js';

import type { DeploymentCreateOutput } from './schema.js';

export const deployTemplateTool = defineManagementMcpTool<typeof deployTemplateArgumentsSchema, DeploymentCreateOutput>({
    name: 'deploy_template',
    title: 'Deploy Template',
    description: 'Deploys a function template, replacing any same-named non-catalog function configuration. Sync templates start for existing connections.',
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
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    confirmation: ({ args, environment }) =>
        `Deploy template "${args.template}" to integration "${args.integration_id}" in environment "${environment.name}"? Any same-named non-catalog function configuration will be replaced.`,
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
