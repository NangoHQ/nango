import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { getGlobalWebhookReceiveUrl, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GongWebhookRouting from './gong-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { GongWebhookPayload } from './types.js';
import type { SignOptions } from 'jsonwebtoken';

const CONNECTION_ID = 'my-connection-id';
const OTHER_CONNECTION_ID = 'other-connection-id';

function webhookUrlFor(connectionId: string, uniqueKey = 'test'): string {
    return `${getGlobalWebhookReceiveUrl()}/${seeders.getTestEnvironment().uuid}/${encodeURIComponent(uniqueKey)}?nangoConnectionId=${connectionId}`;
}

function generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = generateKeyPair();
const { publicKey: OTHER_PUBLIC_KEY, privateKey: OTHER_PRIVATE_KEY } = generateKeyPair();
// Gong's "Show public key" UI hands out just this - the bare base64 DER body, no PEM wrapper.
const BARE_PUBLIC_KEY = PUBLIC_KEY.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, '');

function getNangoMock({
    integrationPublicKey = PUBLIC_KEY,
    connectionSecret = null,
    connectionExists = true,
    uniqueKey = 'test'
}: {
    integrationPublicKey?: string | null;
    connectionSecret?: unknown;
    connectionExists?: boolean;
    uniqueKey?: string;
} = {}) {
    const integration = getTestConfig({
        provider: 'gong',
        unique_key: uniqueKey,
        ...(integrationPublicKey !== null && { custom: { webhookSecret: integrationPublicKey } })
    });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(
            connectionExists ? { connectionId: CONNECTION_ID, metadata: connectionSecret !== null ? { webhookSecret: connectionSecret } : null } : null
        );
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({
        connectionIds: [CONNECTION_ID],
        connectionMetadata: {}
    });

    return { nango, getConnection, execute };
}

function signToken(
    rawBody: string,
    {
        privateKey = PRIVATE_KEY,
        expiresIn = '5m',
        webhookUrl = webhookUrlFor(CONNECTION_ID)
    }: { privateKey?: string; expiresIn?: SignOptions['expiresIn']; webhookUrl?: string } = {}
): string {
    const bodySha256 = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
    return jwt.sign({ webhook_url: webhookUrl, body_sha256: bodySha256 }, privateKey, { algorithm: 'RS256', expiresIn });
}

function getBody(overrides?: Partial<GongWebhookPayload>): GongWebhookPayload {
    return {
        callData: { metaData: { id: 'call-123' } },
        isTest: false,
        ...overrides
    };
}

describe('Gong webhook routing', () => {
    it('routes a webhook after validating its signature', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('verifies a signature using a bare base64 public key with no PEM wrapper', async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: BARE_PUBLIC_KEY });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('rejects a webhook with no connection id', async () => {
        const { nango, getConnection, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the connection does not exist and no secret is configured to validate against', async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: null, connectionExists: false });
        const body = getBody();

        const result = await GongWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('returns success without dispatch when the connection does not exist but the integration signature is valid', async () => {
        const { nango, execute } = getNangoMock({ connectionExists: false });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook when no public key is configured anywhere', async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: null });
        const body = getBody();

        const result = await GongWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it("falls back to the connection's public key when the integration has none", async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: null, connectionSecret: OTHER_PUBLIC_KEY });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody, { privateKey: OTHER_PRIVATE_KEY })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('prefers the integration public key over the connection public key', async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: PUBLIC_KEY, connectionSecret: OTHER_PUBLIC_KEY });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        // signed with the connection's key only -- should fail since the integration key takes priority
        const headers = { authorization: `Bearer ${signToken(rawBody, { privateKey: OTHER_PRIVATE_KEY })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an invalid connection public key', async () => {
        const { nango, execute } = getNangoMock({ integrationPublicKey: null, connectionSecret: ['invalid-key'] });
        const body = getBody();

        const result = await GongWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a webhook missing the authorization header when a key is configured', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();

        const result = await GongWebhookRouting.default(nango, {}, body, JSON.stringify(body), { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a tampered signed payload before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, `${rawBody} `, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an expired token before dispatch', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody, { expiresIn: -10 })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a token signed with an untrusted key', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody, { privateKey: OTHER_PRIVATE_KEY })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a token whose webhook_url claim is missing', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const bodySha256 = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
        const token = jwt.sign({ body_sha256: bodySha256 }, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
        const headers = { authorization: `Bearer ${token}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a validly signed token whose webhook_url claim was registered for a different connection', async () => {
        const { nango, execute } = getNangoMock();
        const body = getBody();
        const rawBody = JSON.stringify(body);
        // signed with a real, trusted key, but the automation rule was registered for OTHER_CONNECTION_ID --
        // replaying it against CONNECTION_ID's route must not be accepted.
        const headers = { authorization: `Bearer ${signToken(rawBody, { webhookUrl: webhookUrlFor(OTHER_CONNECTION_ID) })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isErr()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });

    it('accepts a webhook_url claim for an integration whose unique_key needs URL-encoding', async () => {
        const uniqueKey = 'foo:bar@baz';
        const { nango, execute } = getNangoMock({ uniqueKey });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody, { webhookUrl: webhookUrlFor(CONNECTION_ID, uniqueKey) })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('accepts a webhook_url claim that echoes back the raw (unencoded) unique_key', async () => {
        const uniqueKey = 'foo:bar@baz';
        const { nango, execute } = getNangoMock({ uniqueKey });
        const body = getBody();
        const rawBody = JSON.stringify(body);
        // Same delivery, but the claim uses the raw unique_key rather than the percent-encoded form the
        // dashboard displays - Gong may echo back either, depending on how the URL was pasted in.
        const rawWebhookUrl = `${getGlobalWebhookReceiveUrl()}/${seeders.getTestEnvironment().uuid}/${uniqueKey}?nangoConnectionId=${CONNECTION_ID}`;
        const headers = { authorization: `Bearer ${signToken(rawBody, { webhookUrl: rawWebhookUrl })}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('forwards the full body and connection ids on success', async () => {
        const { nango } = getNangoMock();
        const body = getBody({ isTest: true });
        const rawBody = JSON.stringify(body);
        const headers = { authorization: `Bearer ${signToken(rawBody)}` };

        const result = await GongWebhookRouting.default(nango, headers, body, rawBody, { nangoConnectionId: CONNECTION_ID });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [CONNECTION_ID],
                toForward: body
            });
        }
    });
});
