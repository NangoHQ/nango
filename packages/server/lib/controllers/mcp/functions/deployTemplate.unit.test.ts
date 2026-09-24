import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { deployTemplateTool } from './deployTemplate.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('deployTemplateTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deploys a template through the dedicated template service path', async () => {
        const response = { id: deploymentId, status: 'success' as const, created_at: '2026-01-01T00:00:00.000Z' };
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployTemplate').mockResolvedValue(Ok(response));

        const result = await deployTemplateTool.handler({ integration_id: 'airtable', template: 'tables', function_type: 'sync' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(response);
        }
        expect(deploySpy).toHaveBeenCalledWith({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            body: { type: 'template', integration_id: 'airtable', template: 'tables', function_type: 'sync' }
        });
    });

    it.each([
        { name: 'missing template', args: { integration_id: 'github' } },
        { name: 'code argument', args: { integration_id: 'github', template: 'issues', code: 'code' } },
        { name: 'on-event function type', args: { integration_id: 'github', template: 'issues', function_type: 'on-event' } },
        { name: 'invalid integration ID', args: { integration_id: '..', template: 'issues' } }
    ])('rejects $name before calling the deployment service', async ({ args }) => {
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployTemplate');

        const result = await deployTemplateTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid deploy_template arguments:');
        }
        expect(deploySpy).not.toHaveBeenCalled();
    });

    it('returns expected template errors as public MCP errors', async () => {
        vi.spyOn(functionDeploymentService, 'deployTemplate').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'template_not_found',
                    message: "No template named 'missing' exists for this integration"
                })
            )
        );

        const result = await deployTemplateTool.handler({ integration_id: 'airtable', template: 'missing' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
        }
    });

    it('maps infrastructure template failures to an internal MCP error', async () => {
        vi.spyOn(functionDeploymentService, 'deployTemplate').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'template_deployment_failed',
                    message: 'Failed to deploy the template',
                    cause: new Error('sensitive deployment failure')
                })
            )
        );

        const result = await deployTemplateTool.handler({ integration_id: 'airtable', template: 'tables' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const deploymentId = '3c66291f-6247-47a6-a100-f4d621d751f7';
const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    customerApiKeyId: 7,
    grantedScopes: ['environment:deploy']
} as ManagementMcpContext;
