import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';

import { Ok } from '@nangohq/utils';

import { defineControlPlaneMcpTool } from './controlPlaneTool.js';
import { PublicMcpError } from './utils.js';

import type { ControlPlaneMcpContext } from './controlPlaneTool.js';

const context = {
    account: {},
    environment: {},
    grantedScopes: ['environment:mcp']
} as ControlPlaneMcpContext;

describe('defineControlPlaneMcpTool', () => {
    it('passes parsed arguments to the tool handler', async () => {
        const tool = defineControlPlaneMcpTool({
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: z.object({ limit: z.number().default(10) }).strict(),
            requiredScopes: ['environment:mcp'],
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
        const tool = defineControlPlaneMcpTool({
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: z.object({ limit: z.number().min(1) }).strict(),
            requiredScopes: ['environment:mcp'],
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
});
