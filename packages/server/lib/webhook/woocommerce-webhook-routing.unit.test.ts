import crypto from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import route from './woocommerce-webhook-routing.js';

const CONNECTION_ID = 'store:1/eu west';
const SECRET = 'a&b"c<d>e\'f-store-webhook-secret';

function getNangoMock({ secret = SECRET as unknown, connectionExists = true } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'woocommerce' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const getConnection = vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(connectionExists ? { connectionId: CONNECTION_ID, metadata: { webhookSecret: secret } } : null);
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: [CONNECTION_ID], connectionMetadata: {} });

    return { nango, getConnection, execute };
}

function sign(rawBody: string, secret = SECRET): string {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

// WooCommerce encodes with wp_json_encode, which escapes slashes, so sign the bytes as sent.
const body = { id: 727, status: 'processing', permalink: 'https://shop.example.com/order/727' };
const rawBody = JSON.stringify(body).replaceAll('/', '\\/');
const query = { nangoConnectionId: CONNECTION_ID };

function deliveryHeaders(signature = sign(rawBody)): Record<string, string> {
    return {
        'x-wc-webhook-signature': signature,
        'x-wc-webhook-topic': 'order.updated',
        'x-wc-webhook-source': 'https://shop.example.com/'
    };
}

describe('WooCommerce webhook routing', () => {
    it('routes a signed delivery to the connection in the query', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, deliveryHeaders(), body, rawBody, query);

        expect(result.unwrap()).toStrictEqual({ content: { status: 'success' }, statusCode: 200, connectionIds: [CONNECTION_ID], toForward: body });
        expect(getConnection).toHaveBeenCalledWith(CONNECTION_ID);
        expect(execute).toHaveBeenCalledWith({
            payload: body,
            webhookTypeValue: 'order.updated',
            connectionIdentifierValue: CONNECTION_ID,
            propName: 'connectionId'
        });
    });

    it('answers the creation ping with a 204 and does not route it', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, {}, { webhook_id: '42' }, 'webhook_id=42', query);

        expect(result.unwrap()).toStrictEqual({ content: null, statusCode: 204 });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery with no connection id', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, deliveryHeaders(), body, rawBody, {});

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_connection_id' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery with no signature without looking up the connection', async () => {
        const { nango, getConnection, execute } = getNangoMock();

        const result = await route(nango, { 'x-wc-webhook-topic': 'order.updated' }, body, rawBody, query);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_missing_signature' });
        expect(getConnection).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery signed with another connection secret', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, deliveryHeaders(sign(rawBody, 'another-store-webhook-secret')), body, rawBody, query);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a delivery whose body was changed after signing', async () => {
        const { nango, execute } = getNangoMock();

        const result = await route(nango, deliveryHeaders(), body, JSON.stringify(body), query);

        expect(result.isErr() && result.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown connection, one without a secret and a wrong signature the same way', async () => {
        const wrongSignature = await route(getNangoMock().nango, deliveryHeaders(sign(rawBody, 'another-store-webhook-secret')), body, rawBody, query);
        const unknown = await route(getNangoMock({ connectionExists: false }).nango, deliveryHeaders(), body, rawBody, query);
        const noSecret = await route(getNangoMock({ secret: null }).nango, deliveryHeaders(), body, rawBody, query);
        const notAString = await route(getNangoMock({ secret: 123 }).nango, deliveryHeaders(), body, rawBody, query);

        expect(wrongSignature.isErr() && wrongSignature.error).toMatchObject({ type: 'webhook_invalid_signature' });
        expect(unknown.isErr() && unknown.error).toStrictEqual(wrongSignature.isErr() && wrongSignature.error);
        expect(noSecret.isErr() && noSecret.error).toStrictEqual(wrongSignature.isErr() && wrongSignature.error);
        expect(notAString.isErr() && notAString.error).toStrictEqual(wrongSignature.isErr() && wrongSignature.error);
    });
});
