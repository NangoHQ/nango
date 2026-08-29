import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';

import { envs } from './env.js';
import { getServer } from './server.js';

import type { Scheduler } from '@nangohq/scheduler';

const originalRequired = envs.NANGO_INTERNAL_AUTH_REQUIRED;

afterEach(() => {
    envs.NANGO_INTERNAL_AUTH_REQUIRED = originalRequired;
});

function app() {
    return getServer({} as Scheduler, new EventEmitter(), new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 100, windowMs: 1000 }));
}

async function listen(server: ReturnType<typeof app>) {
    return await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
        const httpServer = server.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((r) => {
                        httpServer.close(() => r());
                    })
            });
        });
    });
}

describe('orchestrator internal service auth', () => {
    it('serves /health without a credential when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/health`);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ status: 'ok' });
        } finally {
            await close();
        }
    });

    it('returns 401 on dequeue without a credential when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/v1/dequeue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });

    it('returns 401 for malformed JSON without Authorization when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/v1/dequeue`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{not-json'
            });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });
});
