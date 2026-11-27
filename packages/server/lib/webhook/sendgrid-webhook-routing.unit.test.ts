import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import route from './sendgrid-webhook-routing.js';

import type { SendGridWebhookPayload } from './sendgrid-webhook-routing.js';

const CONNECTION_ID = 'my-connection-id';
const QUERY = { nangoConnectionId: CONNECTION_ID };

function keyPair(namedCurve = 'prime256v1') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve });
    return { privateKey, verificationKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
}

const OURS = keyPair();
const THEIRS = keyPair();

function getNangoMock({ verificationKey = OURS.verificationKey as unknown, connectionExists = true } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'sendgrid' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(
            connectionExists ? { connectionId: CONNECTION_ID, metadata: verificationKey !== null ? { webhookSecret: verificationKey } : null } : null
        );
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });

    return { nango, getConnection, execute };
}

function sign(rawBody: string, { privateKey = OURS.privateKey, timestamp = String(Math.floor(Date.now() / 1000)) } = {}): Record<string, string> {
    const signature = crypto.sign('sha256', Buffer.from(`${timestamp}${rawBody}`), privateKey).toString('base64');
    return { 'x-twilio-email-event-webhook-signature': signature, 'x-twilio-email-event-webhook-timestamp': timestamp };
}

const BODY: SendGridWebhookPayload = [
    { email: 'a@example.com', timestamp: 1763900000, event: 'delivered', sg_event_id: 'evt_1', sg_message_id: 'msg_1' },
    { email: 'b@example.com', timestamp: 1763900001, event: 'open', sg_event_id: 'evt_2', sg_message_id: 'msg_2' }
];
const RAW_BODY = JSON.stringify(BODY);

describe('SendGrid webhook routing', () => {
    it("routes each event of a batch by nangoConnectionId, verified with that connection's own key", async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, sign(RAW_BODY), BODY, RAW_BODY, QUERY);

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenNthCalledWith(1, {
            payload: BODY[0],
            webhookType: 'event',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
        expect(execute).toHaveBeenNthCalledWith(2, {
            payload: BODY[1],
            webhookType: 'event',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
        expect(result.isOk() && result.value).toMatchObject({ statusCode: 200, connectionIds: [CONNECTION_ID], toForward: BODY });
    });

    it('accepts a retry signed within the 24 hours SendGrid retries for, since it may not sign retries again', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, sign(RAW_BODY, { timestamp: String(Math.floor(Date.now() / 1000) - 23 * 60 * 60) }), BODY, RAW_BODY, QUERY);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('rejects a delivery signed more than 24 hours ago, so a captured batch cannot be replayed later', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, sign(RAW_BODY, { timestamp: String(Math.floor(Date.now() / 1000) - 25 * 60 * 60) }), BODY, RAW_BODY, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        ['an empty batch', []],
        ['a body that is not a batch', { email: 'a@example.com', event: 'delivered' }]
    ])('rejects %s before looking up the connection', async (_name, body) => {
        const { nango, getConnection, execute } = getNangoMock();
        const rawBody = JSON.stringify(body);

        const result = await route(nango, sign(rawBody), body as never, rawBody, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_body' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook without nangoConnectionId', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, sign(RAW_BODY), BODY, RAW_BODY, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it.each([
        ['signature', 'x-twilio-email-event-webhook-signature'],
        ['timestamp', 'x-twilio-email-event-webhook-timestamp']
    ])('rejects a webhook without its %s', async (_case, header) => {
        const { nango, getConnection, execute } = getNangoMock();
        const { [header]: _removed, ...headers } = sign(RAW_BODY);

        const result = await route(nango, headers, BODY, RAW_BODY, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery signed with another key', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, sign(RAW_BODY, { privateKey: THEIRS.privateKey }), BODY, RAW_BODY, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered body', async () => {
        const { nango, execute } = getNangoMock();
        const tampered = JSON.stringify([{ ...BODY[0], event: 'bounce' }]);

        const result = await route(nango, sign(RAW_BODY), JSON.parse(tampered) as SendGridWebhookPayload, tampered, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a changed timestamp, which is part of what is signed', async () => {
        const { nango, execute } = getNangoMock();
        // Both timestamps are fresh, so only the signature can reject the request.
        const signedAt = Math.floor(Date.now() / 1000) - 60;
        const headers = sign(RAW_BODY, { timestamp: String(signedAt) });
        headers['x-twilio-email-event-webhook-timestamp'] = String(signedAt + 1);

        const result = await route(nango, headers, BODY, RAW_BODY, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    // An unknown connection, one without a key, a key that is not one and a wrong signature look the same, so
    // the endpoint can't be used to tell which connections exist or have a key.
    it.each([
        ['does not exist', { connectionExists: false }],
        ['has no verification key', { verificationKey: null }],
        ['has a key that is not a string', { verificationKey: 1234567890123456 }],
        ['has a key that is not a public key', { verificationKey: Buffer.from('not-a-key').toString('base64') }],
        [
            'has a public key that is not an EC key',
            { verificationKey: crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }
        ]
    ])('rejects when the connection %s, like a wrong signature', async (_case, options) => {
        const { nango, execute } = getNangoMock(options);

        const result = await route(nango, sign(RAW_BODY), BODY, RAW_BODY, QUERY);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });
});
