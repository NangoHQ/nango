import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import * as functionDeploymentService from '../../../services/functionDeployment.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { deployFunctionsTool } from './deploy.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('deployFunctionsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts a single function deployment with the authenticated customer API key', async () => {
        const response = { id: '3c66291f-6247-47a6-a100-f4d621d751f7', status: 'running' as const, created_at: '2026-01-01T00:00:00.000Z' };
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(Ok(response));
        const templateSpy = vi.spyOn(functionDeploymentService, 'deployTemplate');

        const result = await deployFunctionsTool.handler(
            {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                version: '1.0.0',
                allow_destructive: true
            },
            context
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(response);
        }
        expect(deploySpy).toHaveBeenCalledWith({
            environment: context.environment,
            parentCustomerApiKeyId: 7,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'sync-issues',
                function_type: 'sync',
                code: 'export default {}',
                version: '1.0.0',
                allow_destructive: true
            }
        });
        expect(templateSpy).not.toHaveBeenCalled();
    });

    it('starts a template deployment without calling the single function path', async () => {
        const response = { id: '3c66291f-6247-47a6-a100-f4d621d751f7', status: 'success' as const, created_at: '2026-01-01T00:00:00.000Z' };
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployFunction');
        const templateSpy = vi.spyOn(functionDeploymentService, 'deployTemplate').mockResolvedValue(Ok(response));

        const result = await deployFunctionsTool.handler({ type: 'template', integration_id: 'airtable', template: 'tables', function_type: 'sync' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(response);
        }
        expect(templateSpy).toHaveBeenCalledWith({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            body: { type: 'template', integration_id: 'airtable', template: 'tables', function_type: 'sync' }
        });
        expect(deploySpy).not.toHaveBeenCalled();
    });

    it.each([
        { name: 'missing type', args: { integration_id: 'github' } },
        { name: 'unknown argument', args: { type: 'template', integration_id: 'github', template: 'issues', unexpected: true } },
        { name: 'missing function name', args: { type: 'function', integration_id: 'github', function_type: 'sync', code: 'code' } },
        { name: 'missing function type', args: { type: 'function', integration_id: 'github', function_name: 'issues', code: 'code' } },
        { name: 'empty code', args: { type: 'function', integration_id: 'github', function_name: 'issues', function_type: 'sync', code: '' } },
        {
            name: 'template field on function deployment',
            args: { type: 'function', integration_id: 'github', function_name: 'issues', function_type: 'sync', code: 'code', template: 'issues' }
        },
        { name: 'missing template', args: { type: 'template', integration_id: 'github' } },
        { name: 'code on template deployment', args: { type: 'template', integration_id: 'github', template: 'issues', code: 'code' } },
        { name: 'on-event function type', args: { type: 'template', integration_id: 'github', template: 'issues', function_type: 'on-event' } },
        { name: 'invalid integration ID', args: { type: 'template', integration_id: '..', template: 'issues' } }
    ])('rejects $name before calling a deployment service', async ({ args }) => {
        const deploySpy = vi.spyOn(functionDeploymentService, 'deployFunction');
        const templateSpy = vi.spyOn(functionDeploymentService, 'deployTemplate');

        const result = await deployFunctionsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid functions_deploy arguments:');
        }
        expect(deploySpy).not.toHaveBeenCalled();
        expect(templateSpy).not.toHaveBeenCalled();
    });

    it('returns expected deployment errors as public MCP errors', async () => {
        vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'integration_not_found',
                    message: "Integration 'missing' was not found"
                })
            )
        );

        const result = await deployFunctionsTool.handler(
            {
                type: 'function',
                integration_id: 'missing',
                function_name: 'issues',
                function_type: 'sync',
                code: 'export default {}'
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Integration 'missing' was not found");
        }
    });

    it('maps infrastructure deployment failures to an internal MCP error', async () => {
        vi.spyOn(functionDeploymentService, 'deployFunction').mockResolvedValue(
            Err(
                new functionDeploymentService.FunctionDeploymentServiceError({
                    code: 'deployment_failed',
                    message: 'Failed to start function deployment',
                    cause: new Error('sensitive sandbox failure')
                })
            )
        );

        const result = await deployFunctionsTool.handler(
            {
                type: 'function',
                integration_id: 'github',
                function_name: 'issues',
                function_type: 'sync',
                code: 'export default {}'
            },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    customerApiKeyId: 7,
    grantedScopes: ['environment:deploy']
} as ManagementMcpContext;
