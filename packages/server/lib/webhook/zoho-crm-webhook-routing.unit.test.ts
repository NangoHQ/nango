import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as ZohoCrmWebhookRouting from './zoho-crm-webhook-routing.js';

import type { ZohoCrmWebhookPayload } from './types.js';
import type { NangoError } from '@nangohq/shared';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'someone-elses-connection-id';
const TOKEN = 'zoho-channel-token';
const OTHER_TOKEN = 'another-zoho-channel-token';
const QUERY = { nangoConnectionId: CONNECTION_ID };

function getNangoMock({
    connectionSecret = TOKEN,
    connectionExists = true,
    integrationSecret
}: { connectionSecret?: unknown; connectionExists?: boolean; integrationSecret?: string } = {}) {
    const integration = getTestConfig({ provider: 'zoho-crm', ...(integrationSecret && { custom: { webhookSecret: integrationSecret } }) });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi.spyOn(nango, 'getConnectionForWebhook').mockImplementation((connectionId: string) => {
        if (connectionId === OTHER_CONNECTION_ID) {
            return Promise.resolve({ connectionId: OTHER_CONNECTION_ID, metadata: { webhookSecret: OTHER_TOKEN } });
        }
        if (!connectionExists) {
            return Promise.resolve(null);
        }
        return Promise.resolve({ connectionId: CONNECTION_ID, metadata: connectionSecret !== null ? ({ webhookSecret: connectionSecret } as never) : null });
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, getConnection, execute };
}

// Shape of the documented notification body
// https://www.zoho.com/crm/developer/docs/api/v8/notifications/enable.html
function getBody(overrides?: Partial<ZohoCrmWebhookPayload>, omit: (keyof ZohoCrmWebhookPayload)[] = []): ZohoCrmWebhookPayload {
    const body: ZohoCrmWebhookPayload = {
        server_time: 1718117126473,
        query_params: { nangoConnectionId: CONNECTION_ID },
        module: 'Leads',
        resource_uri: 'https://www.zohoapis.com/crm/v2/Leads',
        ids: ['5725767000003000064'],
        affected_fields: [],
        operation: 'insert',
        channel_id: '1000000068001',
        token: TOKEN,
        ...overrides
    };
    for (const key of omit) {
        delete body[key];
    }
    return body;
}

function errorType(result: unknown): string {
    return (result as { error: NangoError }).error.type;
}

async function run(nango: InternalNango, body: ZohoCrmWebhookPayload, query: Record<string, string> = QUERY) {
    return ZohoCrmWebhookRouting.default(nango, {}, body, JSON.stringify(body), query);
}

describe('Zoho CRM webhook routing', () => {
    it("routes by nangoConnectionId when the token matches that connection's secret", async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();

        const result = await run(nango, body);

        expect(result.isOk()).toBe(true);
        expect(result.unwrap()).toEqual({ content: { status: 'success' }, statusCode: 200, connectionIds: [CONNECTION_ID], toForward: body });
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookTypeValue: 'Leads.insert',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('uses module and operation as the webhook type for updates and deletes', async () => {
        const { nango, execute } = getNangoMock();

        await run(nango, getBody({ module: 'Contacts', operation: 'delete' }));

        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookTypeValue: 'Contacts.delete' }));
    });

    it('routes without a webhook type when the body has no module or operation', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody({}, ['module', 'operation']);

        const result = await run(nango, body);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({ payload: body, connectionIdentifierValue: CONNECTION_ID, propName: 'connectionId' });
    });

    it('rejects a notify_url without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await run(nango, getBody(), {});

        expect(errorType(result)).toBe('webhook_missing_connection_id');
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a token that does not match', async () => {
        const { nango, execute } = getNangoMock();

        const result = await run(nango, getBody({ token: 'wrong-token' }));

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects another connection's token sent to this connection", async () => {
        const { nango, execute } = getNangoMock();

        const result = await run(nango, getBody({ token: OTHER_TOKEN }));

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a notification without a token', async () => {
        const { nango, execute } = getNangoMock();

        const result = await run(nango, getBody({}, ['token']));

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection has no webhook secret, even if the integration has one', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: null, integrationSecret: TOKEN });

        const result = await run(nango, getBody());

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a non-string webhook secret', async () => {
        const { nango, execute } = getNangoMock({ connectionSecret: { nested: true } });

        const result = await run(nango, getBody());

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown connection with the same error as a wrong token', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });

        const result = await run(nango, getBody());

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a connection id that has characters a URL path or Basic username could not carry', async () => {
        // connectionIdSchema allows these; the query param carries them once the notify_url encodes them.
        const awkward = 'tenant:1/a b@x+y';
        const { nango, getConnection, execute } = getNangoMock();

        const result = await run(nango, getBody(), { nangoConnectionId: awkward });

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(awkward);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: awkward, propName: 'connectionId' }));
    });

    it('rejects a webhook secret shorter than 16 characters, even when the token matches', async () => {
        const short = 'short-token';
        const { nango, execute } = getNangoMock({ connectionSecret: short });

        const result = await run(nango, getBody({ token: short }));

        expect(errorType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a null or non-object body with a 401, not a 500', async () => {
        for (const body of [null, 'token=zoho-channel-token', ['zoho-channel-token']]) {
            const { nango, execute } = getNangoMock();

            const result = await ZohoCrmWebhookRouting.default(nango, {}, body as never, JSON.stringify(body), QUERY);

            expect(errorType(result)).toBe('webhook_invalid_signature');
            expect((result as unknown as { error: NangoError }).error.status).toBe(401);
            expect(execute).not.toHaveBeenCalled();
        }
    });

    it('answers an unknown connection, a connection without a secret and a wrong token identically', async () => {
        const errors = [];
        for (const [options, body] of [
            [{ connectionExists: false }, getBody()],
            [{ connectionSecret: null }, getBody()],
            [{}, getBody({ token: 'wrong-token-of-enough-length' })]
        ] as const) {
            const { nango } = getNangoMock(options);
            const { error } = (await run(nango, body)) as unknown as { error: NangoError };
            errors.push({ type: error.type, status: error.status, message: error.message });
        }

        expect(errors[1]).toEqual(errors[0]);
        expect(errors[2]).toEqual(errors[0]);
    });
});
