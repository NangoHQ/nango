import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, flags, Ok } from '@nangohq/utils';

import { audit } from '../../../audit.js';
import integrationService, { IntegrationServiceError } from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { deleteIntegrationsTool } from './delete.js';

import type { ManagementMcpContext } from '../managementTool.js';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:delete']
} as ManagementMcpContext;

describe('integrationsDeleteTool', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('maps arguments to the service and independently formats its domain result', async () => {
        const deleteSpy = vi.spyOn(integrationService, 'delete').mockResolvedValue(Ok({ integrationId: 'github' }));

        const result = await deleteIntegrationsTool.handler({ integration_id: 'github' }, context);

        expect(deleteSpy).toHaveBeenCalledWith({ environmentId: 42, integrationId: 'github' });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ success: true });
        }
    });

    it('rejects invalid arguments before calling the service', async () => {
        const deleteSpy = vi.spyOn(integrationService, 'delete');

        const result = await deleteIntegrationsTool.handler({ integration_id: 'github', unexpected: true }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid integrations_delete arguments: arguments:');
        }
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('maps missing integrations to public MCP errors', async () => {
        vi.spyOn(integrationService, 'delete').mockResolvedValue(
            Err(
                new IntegrationServiceError({
                    code: 'not_found',
                    message: 'Integration "missing" does not exist'
                })
            )
        );

        const result = await deleteIntegrationsTool.handler({ integration_id: 'missing' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Integration "missing" does not exist');
        }
    });

    it('keeps unexpected service errors private', async () => {
        const serviceError = new IntegrationServiceError({ code: 'delete_failed', message: 'Failed to delete integration' });
        vi.spyOn(integrationService, 'delete').mockResolvedValue(Err(serviceError));

        const result = await deleteIntegrationsTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(serviceError);
            expect(result.error).not.toBeInstanceOf(PublicMcpError);
        }
    });

    it('audits the deleted integration', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
        vi.spyOn(integrationService, 'delete').mockResolvedValue(Ok({ integrationId: 'github' }));

        const result = await deleteIntegrationsTool.handler({ integration_id: 'github' }, auditedContext());

        expect(result.isOk()).toBe(true);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith({
                occurredAt: expect.any(String),
                accountId: 1,
                scope: 'environment',
                environment: { id: 'e0000000-0000-4000-8000-000000000042', display: 'dev' },
                actor: { type: 'api_key', id: '7', display: 'Management key' },
                resource: 'integration',
                action: 'deleted',
                targets: [{ type: 'integration', id: 'github' }],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'success'
            });
        });
    });
});

function auditedContext(): ManagementMcpContext {
    return {
        account: { id: 1, uuid: 'account-uuid' },
        environment: { id: 42, uuid: 'e0000000-0000-4000-8000-000000000042', name: 'dev' },
        grantedScopes: ['environment:integrations:delete'],
        audit: {
            actor: { type: 'api_key', id: '7', display: 'Management key' },
            context: { ip: '127.0.0.1', userAgent: 'test-client' }
        }
    } as ManagementMcpContext;
}
