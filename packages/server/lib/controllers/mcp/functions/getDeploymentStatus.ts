import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { getDeploymentStatusServiceErrorToMcp } from './errors.js';
import { getDeploymentStatusArgumentsSchema, getDeploymentStatusOutputSchema } from './schema.js';

import type { GetDeploymentStatusOutput } from './schema.js';

export const getDeploymentStatusTool = defineManagementMcpTool<typeof getDeploymentStatusArgumentsSchema, GetDeploymentStatusOutput>({
    name: 'get_deployment_status',
    description: 'Retrieve a function deployment by ID to check whether it is still running, succeeded, or failed.',
    inputSchema: getDeploymentStatusArgumentsSchema,
    outputSchema: getDeploymentStatusOutputSchema,
    requiredScopes: { every: ['environment:deploy'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    async handler({ args, environment }) {
        return (await functionDeploymentService.getDeploymentStatus({ environment, id: args.id })).mapError((error) =>
            getDeploymentStatusServiceErrorToMcp(error)
        );
    }
});
