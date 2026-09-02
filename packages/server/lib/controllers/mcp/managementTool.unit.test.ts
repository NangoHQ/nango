import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';

import { Err, flags, Ok } from '@nangohq/utils';

import { audit } from '../../audit.js';
import { defineManagementMcpTool } from './managementTool.js';
import { PublicMcpError } from './utils.js';

import type { ManagementMcpContext } from './managementTool.js';
import type { Result } from '@nangohq/utils';

const context = {
    account: {},
    environment: {},
    grantedScopes: ['environment:mcp']
} as ManagementMcpContext;

const auditedContext = {
    account: { id: 1, uuid: 'account-uuid' },
    environment: { id: 2, uuid: 'e0000000-0000-4000-8000-000000000002', name: 'dev' },
    grantedScopes: ['environment:mcp'],
    audit: {
        actor: { type: 'api_key', id: '7', display: 'Management key' },
        context: { ip: '127.0.0.1', userAgent: 'test-client' }
    }
} as ManagementMcpContext;

const auditedToolArgumentsSchema = z.object({ provider: z.string() }).strict();
type AuditedToolOutput = { data: { unique_key: string } };

describe('defineManagementMcpTool', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('passes parsed arguments to the tool handler', async () => {
        const tool = defineManagementMcpTool({
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: z.object({ limit: z.number().default(10) }).strict(),
            requiredScopes: { every: ['environment:mcp'] },
            audit: { kind: 'no-audit', reason: 'read-only' },
            handler({ args }) {
                return Ok({ limit: args.limit });
            }
        });

        const result = await tool.handler({}, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({ limit: 10 });
        }
    });

    it('returns a public error for invalid arguments', async () => {
        const tool = defineManagementMcpTool({
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: z.object({ limit: z.number().min(1) }).strict(),
            requiredScopes: { every: ['environment:mcp'] },
            audit: { kind: 'no-audit', reason: 'read-only' },
            handler({ args }) {
                return Ok({ limit: args.limit });
            }
        });

        const result = await tool.handler({ limit: 0 }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid test_tool arguments: limit:');
        }
    });

    it('records successful audited tool executions using parsed arguments and output', async () => {
        const auditSpy = enableAudit();
        const tool = auditedTool(() => Ok({ data: { unique_key: 'github' } }));

        const result = await tool.handler({ provider: 'github' }, auditedContext);

        expect(result.isOk()).toBe(true);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith({
                occurredAt: expect.any(String),
                accountId: 1,
                scope: 'environment',
                environment: { id: 'e0000000-0000-4000-8000-000000000002', display: 'dev' },
                actor: { type: 'api_key', id: '7', display: 'Management key' },
                resource: 'integration',
                action: 'created',
                targets: [{ type: 'integration', id: 'github' }],
                context: { interface: 'mcp', ip: '127.0.0.1', userAgent: 'test-client' },
                outcome: 'success',
                metadata: { provider: 'github' }
            });
        });
    });

    describe('dynamic audit', () => {
        it.each([
            { state: 'started' as const, action: 'started' },
            { state: 'paused' as const, action: 'paused' }
        ])('resolves the $action audit action from the raw state argument', async ({ state, action }) => {
            const auditSpy = enableAudit();
            const tool = dynamicAuditedTool();

            const result = await tool.handler({ state, label: 'valid' }, auditedContext);

            expect(result.isOk()).toBe(true);
            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ resource: 'sync', action, outcome: 'success' }));
            });
        });

        it.each(['started', 'paused'] as const)('audits invalid arguments as a failed %s attempt when the state is valid', async (state) => {
            const auditSpy = enableAudit();
            const tool = dynamicAuditedTool();

            const result = await tool.handler({ state, label: 42 }, auditedContext);

            expect(result.isErr()).toBe(true);
            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ resource: 'sync', action: state, outcome: 'failure', targets: [] }));
            });
            expect(auditSpy.mock.calls[0]?.[0]).not.toHaveProperty('metadata');
        });

        it.each([
            { name: 'invalid', args: { state: 'invalid', label: 'valid' } },
            { name: 'missing', args: { label: 'valid' } }
        ])('does not audit invalid arguments when the dynamic action is $name', async ({ args }) => {
            const auditSpy = enableAudit();
            const tool = dynamicAuditedTool();

            const result = await tool.handler(args, auditedContext);

            expect(result.isErr()).toBe(true);
            expect(auditSpy).not.toHaveBeenCalled();
        });
    });

    it('records failed tool results without a success-only target', async () => {
        const auditSpy = enableAudit();
        const tool = auditedTool(() => Err<AuditedToolOutput>(new PublicMcpError('Creation failed')));

        const result = await tool.handler({ provider: 'github' }, auditedContext);

        expect(result.isErr()).toBe(true);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    resource: 'integration',
                    action: 'created',
                    outcome: 'failure',
                    targets: [],
                    metadata: { provider: 'github' }
                })
            );
        });
    });

    it('records thrown tool errors as failures before rethrowing them', async () => {
        const auditSpy = enableAudit();
        const tool = auditedTool(() => {
            throw new Error('Creation failed');
        });

        await expect(tool.handler({ provider: 'github' }, auditedContext)).rejects.toThrow('Creation failed');
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    outcome: 'failure',
                    targets: [],
                    metadata: { provider: 'github' }
                })
            );
        });
    });

    it('records invalid arguments as failures without reading unvalidated values', async () => {
        const auditSpy = enableAudit();
        const handlerSpy = vi.fn(() => Ok({ data: { unique_key: 'unused' } }));
        const tool = auditedTool(handlerSpy);

        const result = await tool.handler({ provider: 42 }, auditedContext);

        expect(result.isErr()).toBe(true);
        expect(handlerSpy).not.toHaveBeenCalled();
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    outcome: 'failure',
                    targets: []
                })
            );
        });
        expect(auditSpy.mock.calls[0]?.[0]).not.toHaveProperty('metadata');
    });

    it('does not write audit events when the account is not entitled', async () => {
        const auditSpy = vi.spyOn(audit, 'record');
        const tool = auditedTool(() => Ok({ data: { unique_key: 'github' } }));

        const result = await tool.handler({ provider: 'github' }, auditedContext);

        expect(result.isOk()).toBe(true);
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('does not audit tools that explicitly opt out', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record');
        const tool = defineManagementMcpTool({
            name: 'test_read_tool',
            description: 'Test read-only tool',
            inputSchema: z.object({}).strict(),
            requiredScopes: { every: ['environment:mcp'] },
            audit: { kind: 'no-audit', reason: 'read-only' },
            handler: () => Ok({ data: [] })
        });

        const result = await tool.handler({}, auditedContext);

        expect(result.isOk()).toBe(true);
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('does not change the tool result when the audit writer fails', async () => {
        flags.hasAuditTrail = true;
        const auditSpy = vi.spyOn(audit, 'record').mockResolvedValue(Err(new Error('writer unavailable')));
        const tool = auditedTool(() => Ok({ data: { unique_key: 'github' } }));

        const result = await tool.handler({ provider: 'github' }, auditedContext);

        expect(result.isOk()).toBe(true);
        await vi.waitFor(() => expect(auditSpy).toHaveBeenCalledOnce());
    });
});

function enableAudit() {
    flags.hasAuditTrail = true;
    return vi.spyOn(audit, 'record').mockResolvedValue(Ok(undefined));
}

function dynamicAuditedTool() {
    return defineManagementMcpTool({
        name: 'test_dynamic_audit_tool',
        description: 'Test dynamic audit tool',
        inputSchema: z.object({ state: z.enum(['started', 'paused']), label: z.string() }).strict(),
        requiredScopes: { every: ['environment:mcp'] },
        audit: {
            kind: 'dynamic-audit',
            policy: ({ args }) => {
                if (typeof args !== 'object' || args === null) {
                    return undefined;
                }
                const state = (args as Record<string, unknown>)['state'];
                return state === 'started' || state === 'paused' ? { kind: 'audit', resource: 'sync', action: state, scope: 'environment' } : undefined;
            },
            metadata: ({ args }) => ({ providerConfigKey: args.label })
        },
        handler: () => Ok({ success: true })
    });
}

function auditedTool(handler: () => Result<AuditedToolOutput>) {
    return defineManagementMcpTool<typeof auditedToolArgumentsSchema, AuditedToolOutput>({
        name: 'test_create_tool',
        description: 'Test audited tool',
        inputSchema: auditedToolArgumentsSchema,
        requiredScopes: { every: ['environment:mcp'] },
        audit: {
            kind: 'audit',
            resource: 'integration',
            action: 'created',
            scope: 'environment',
            metadata: ({ args }) => ({ provider: args.provider }),
            targetFromOutput: ({ output }) => ({ type: 'integration', id: output.data.unique_key })
        },
        handler
    });
}
