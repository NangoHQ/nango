import { makeAuditTarget } from '../../../audit.js';
import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { deleteIntegrationsServiceErrorToMcp } from './errors.js';
import { deleteIntegrationsArgumentsSchema, deleteIntegrationsOutputSchema } from './schema.js';

import type { DeleteIntegrationsOutput } from './schema.js';

export const deleteIntegrationsTool = defineManagementMcpTool<typeof deleteIntegrationsArgumentsSchema, DeleteIntegrationsOutput>({
    name: 'integrations_delete',
    description: 'Delete a configured integration by ID.',
    inputSchema: deleteIntegrationsArgumentsSchema,
    outputSchema: deleteIntegrationsOutputSchema,
    requiredScopes: { every: ['environment:integrations:delete'] },
    audit: {
        kind: 'audit',
        resource: 'integration',
        action: 'deleted',
        scope: 'environment',
        targetFromOutput: ({ args }) => makeAuditTarget('integration', args.integration_id)
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
    },
    async handler({ args, environment }) {
        const result = await integrationService.delete({
            environmentId: environment.id,
            integrationId: args.integration_id
        });

        return result.map(() => ({ success: true as const })).mapError((error) => deleteIntegrationsServiceErrorToMcp(error));
    }
});
