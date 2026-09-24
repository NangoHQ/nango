import { createServer } from 'node:http';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { environmentService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { postManagementMcp } from './management.js';

import type { DBTeam, DBUser } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

describe('POST /mcp', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns OAuth security schemes on the tool descriptors', async () => {
        vi.spyOn(environmentService, 'getEnvironmentsByAccountId').mockResolvedValue(
            Ok([{ id: 1, uuid: 'dev-environment', name: 'dev', is_production: false }])
        );

        const app = express();
        app.use(express.json());
        app.use((_req, res, next) => {
            Object.assign(res.locals, {
                authType: 'mcpOAuth',
                account: fakeAccount(),
                plan: null,
                user: { id: 1, email: 'user@nango.dev', role: 'administrator' } as DBUser
            });
            next();
        });
        app.post('/mcp', postManagementMcp);

        const httpServer = createServer((req, res) => {
            void app(req, res);
        });
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

        try {
            const address = httpServer.address() as AddressInfo;
            const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
            });

            expect(response.status).toBe(200);
            const payload = parseMcpResponse(await response.text());
            expect(payload.result.tools.length).toBeGreaterThan(0);
            for (const tool of payload.result.tools) {
                expect(tool).toMatchObject({
                    securitySchemes: [{ type: 'oauth2', scopes: ['environment:*'] }],
                    _meta: {
                        securitySchemes: [{ type: 'oauth2', scopes: ['environment:*'] }]
                    }
                });
            }
        } finally {
            await new Promise<void>((resolve, reject) => {
                httpServer.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});

function fakeAccount(): DBTeam {
    const now = new Date();
    return {
        id: 1,
        name: 'Test Account',
        uuid: 'test-account',
        found_us: null,
        created_at: now,
        updated_at: now
    };
}

function parseMcpResponse(body: string): { result: { tools: Array<Record<string, unknown>> } } {
    const trimmed = body.trim();
    if (!trimmed.startsWith('event:') && !trimmed.startsWith('data:')) {
        return JSON.parse(trimmed) as { result: { tools: Array<Record<string, unknown>> } };
    }

    const data = trimmed
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart())
        .join('\n');
    return JSON.parse(data) as { result: { tools: Array<Record<string, unknown>> } };
}
