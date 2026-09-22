import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import route from './halo-psa-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

function setup(secret: unknown = 'connection-secret', exists = true) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'halo-psa' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const lookup = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(exists ? { connectionId: 'tenant-a', metadata: { webhookSecret: secret } } : null);
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: ['tenant-a'], connectionMetadata: {} });
    return { nango, lookup, execute };
}

function auth(value = 'tenant-a:connection-secret') {
    return { authorization: `Basic ${Buffer.from(value).toString('base64')}` };
}

const body = { event: 'Ticket Updated', ticket: { id: 123 } };

describe('Halo PSA webhook routing', () => {
    it('authenticates the connection and preserves the payload', async () => {
        const { nango, lookup, execute } = setup();
        const result = await route(nango, auth(), body, JSON.stringify(body));
        expect(lookup).toHaveBeenCalledWith('tenant-a');
        expect(execute).toHaveBeenCalledWith({ payload: body, connectionIdentifierValue: 'tenant-a', propName: 'connectionId' });
        expect(result.unwrap()).toEqual({ content: { status: 'success' }, statusCode: 200, connectionIds: ['tenant-a'], toForward: body });
    });

    it.each(['', 'Bearer token', 'Basic !!!', auth('no-separator').authorization, auth(':password').authorization])(
        'rejects malformed credentials before connection lookup: %s',
        async (authorization) => {
            const { nango, lookup, execute } = setup();
            expect((await route(nango, { authorization }, body, '')).isErr()).toBe(true);
            expect(lookup).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
        }
    );

    it.each([null, '', 123, 'another-tenant-secret'])('rejects missing, invalid, or mismatched connection secrets: %s', async (secret) => {
        const { nango, execute } = setup(secret);
        expect((await route(nango, auth(), body, '')).isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects unknown connections without dispatching', async () => {
        const { nango, execute } = setup('connection-secret', false);
        expect((await route(nango, auth(), body, '')).isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('accepts colons in passwords', async () => {
        const { nango } = setup('secret:with:colons');
        expect((await route(nango, auth('tenant-a:secret:with:colons'), body, '')).isOk()).toBe(true);
    });
});
