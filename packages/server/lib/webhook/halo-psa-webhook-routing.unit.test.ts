import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { NangoError, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import route from './halo-psa-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const secrets = { 'tenant-a': 'connection-secret-a', 'tenant-b': 'connection-secret-b' };

function setup(connectionSecrets: Record<string, unknown> = secrets) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'halo-psa' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const connections = new Map(Object.entries(connectionSecrets));
    const lookup = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockImplementation((connectionId) =>
            Promise.resolve(connections.has(connectionId) ? { connectionId, metadata: { webhookSecret: connections.get(connectionId) } } : null)
        );
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockImplementation(({ connectionIdentifierValue }) =>
        Promise.resolve({
            connectionIds: connectionIdentifierValue ? [connectionIdentifierValue] : [],
            connectionMetadata: {}
        })
    );
    return { nango, lookup, execute };
}

function auth(value = `tenant-a:${secrets['tenant-a']}`) {
    return { authorization: `Basic ${Buffer.from(value).toString('base64')}` };
}

function expectUnauthorized(result: Awaited<ReturnType<typeof route>>, type: string) {
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
        expect(result.error).toBeInstanceOf(NangoError);
        expect(result.error).toMatchObject({ type, status: 401 });
    }
}

const body = { event: 'Ticket Updated', ticket: { id: 123 } };

describe('Halo PSA webhook routing', () => {
    it.each(Object.entries(secrets))('authenticates %s only with its own secret and preserves the payload', async (connectionId, secret) => {
        const { nango, lookup, execute } = setup();
        const result = await route(nango, auth(`${connectionId}:${secret}`), body, JSON.stringify(body));
        expect(lookup).toHaveBeenCalledWith(connectionId);
        expect(execute).toHaveBeenCalledWith({ payload: body, connectionIdentifierValue: connectionId, propName: 'connectionId' });
        expect(result.unwrap()).toEqual({ content: { status: 'success' }, statusCode: 200, connectionIds: [connectionId], toForward: body });

        execute.mockClear();
        const otherSecret = Object.values(secrets).find((value) => value !== secret);
        expectUnauthorized(await route(nango, auth(`${connectionId}:${otherSecret}`), body, ''), 'webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        ['', 'webhook_missing_token'],
        ['Bearer token', 'webhook_missing_token'],
        ['Basic !!!', 'webhook_missing_token'],
        [auth('no-separator').authorization, 'webhook_invalid_signature'],
        [auth(':password').authorization, 'webhook_invalid_signature']
    ])('rejects malformed credentials before connection lookup: %s', async (authorization, errorType) => {
        const { nango, lookup, execute } = setup();
        expectUnauthorized(await route(nango, { authorization }, body, ''), errorType);
        expect(lookup).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([null, '', 123, 'another-tenant-secret'])('rejects missing, invalid, or mismatched connection secrets: %s', async (secret) => {
        const { nango, execute } = setup({ 'tenant-a': secret });
        expectUnauthorized(await route(nango, auth(), body, ''), 'webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects unknown connections without dispatching', async () => {
        const { nango, execute } = setup({});
        expectUnauthorized(await route(nango, auth(), body, ''), 'webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('accepts colons in passwords', async () => {
        const { nango } = setup({ 'tenant-a': 'secret:with:colons' });
        expect((await route(nango, auth('tenant-a:secret:with:colons'), body, '')).isOk()).toBe(true);
    });
});
