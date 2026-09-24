import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as AffinityWebhookRouting from './affinity-webhook-routing.js';
import * as FilloutWebhookRouting from './fillout-webhook-routing.js';
import { InternalNango } from './internal-nango.js';
import { connectionsWithValidSecret, rejectUnverifiedWebhook, verifyNangoWebhookSecret, withoutNangoWebhookSecret } from './nango-webhook-secret.js';
import * as ShipstationWebhookRouting from './shipstation-webhook-routing.js';

import type { affinityWebhookResponse } from './types.js';
import type { NangoError } from '@nangohq/shared';
import type { DBConnectionDecrypted } from '@nangohq/types';

const SECRET = 'a-long-enough-webhook-secret';
const OTHER_SECRET = 'another-long-enough-secret';

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function routedTo(result: unknown) {
    return (result as { value: { connectionIds: string[] } }).value.connectionIds;
}

function dbConnection(connectionId: string, webhookSecret?: string) {
    return { connection_id: connectionId, metadata: webhookSecret ? { webhookSecret } : null } as unknown as DBConnectionDecrypted;
}

function makeNango(provider: string) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider, custom: { webhookSecret: SECRET } }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn(({ connectionIdentifierValue }: { connectionIdentifierValue?: string }) =>
        Promise.resolve({ connectionIds: connectionIdentifierValue ? [connectionIdentifierValue] : [], connectionMetadata: {} })
    );
    nango.executeScriptForWebhooks = execute;
    return { nango, execute };
}

function withConnection(nango: InternalNango, webhookSecret?: string | null) {
    return vi
        .spyOn(nango, 'getConnectionForWebhook')
        .mockResolvedValue(webhookSecret === null ? null : { connectionId: 'conn-1', metadata: webhookSecret ? { webhookSecret } : null });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('verifyNangoWebhookSecret', () => {
    it('accepts the secret in the header or the query param', () => {
        expect(verifyNangoWebhookSecret({ secret: SECRET, headers: { 'x-nango-webhook-secret': SECRET } }).isOk()).toBe(true);
        expect(verifyNangoWebhookSecret({ secret: SECRET, headers: {}, query: { nangoWebhookSecret: SECRET } }).isOk()).toBe(true);
    });

    it('rejects a missing, short or wrong secret', () => {
        expect(errType(verifyNangoWebhookSecret({ secret: undefined, headers: { 'x-nango-webhook-secret': SECRET } }))).toBe('webhook_invalid_secret');
        expect(errType(verifyNangoWebhookSecret({ secret: 'short', headers: { 'x-nango-webhook-secret': 'short' } }))).toBe('webhook_invalid_secret');
        expect(errType(verifyNangoWebhookSecret({ secret: SECRET, headers: {} }))).toBe('webhook_missing_signature');
        expect(errType(verifyNangoWebhookSecret({ secret: SECRET, headers: { 'x-nango-webhook-secret': `${SECRET}x` } }))).toBe('webhook_invalid_signature');
    });

    it('checks the header over the query param when both are sent', () => {
        const result = verifyNangoWebhookSecret({ secret: SECRET, headers: { 'x-nango-webhook-secret': 'wrong' }, query: { nangoWebhookSecret: SECRET } });
        expect(errType(result)).toBe('webhook_invalid_signature');
    });

    it('keeps only the connections whose own secret matches', () => {
        const connections = [
            { id: 'a', metadata: { webhookSecret: SECRET } },
            { id: 'b', metadata: { webhookSecret: OTHER_SECRET } },
            { id: 'c', metadata: null }
        ];
        expect(connectionsWithValidSecret(connections, { 'x-nango-webhook-secret': SECRET }).map((c) => c.id)).toEqual(['a']);
    });

    it('rejects based only on whether a secret was sent', () => {
        expect(errType(rejectUnverifiedWebhook({}))).toBe('webhook_missing_signature');
        expect(errType(rejectUnverifiedWebhook({ 'x-nango-webhook-secret': 'x' }))).toBe('webhook_invalid_signature');
        expect(errType(rejectUnverifiedWebhook({}, { nangoWebhookSecret: 'x' }))).toBe('webhook_invalid_signature');
    });

    it('strips the query param so it does not reach functions', () => {
        expect(withoutNangoWebhookSecret({ nangoWebhookSecret: SECRET, other: '1' })).toEqual({ other: '1' });
    });
});

describe('affinity webhook routing', () => {
    const body = { type: 'list_entry.created', body: {}, sent_at: 1 } as affinityWebhookResponse;
    const rawBody = JSON.stringify(body);

    it('routes to the connection in nangoConnectionId when its secret matches', async () => {
        const { nango, execute } = makeNango('affinity');
        withConnection(nango, SECRET);

        const result = await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoConnectionId: 'conn-1', nangoWebhookSecret: SECRET });

        expect(routedTo(result)).toEqual(['conn-1']);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: 'conn-1', propName: 'connectionId', webhookType: 'type' }));
    });

    it('requires nangoConnectionId', async () => {
        const { nango, execute } = makeNango('affinity');

        const result = await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoWebhookSecret: SECRET });

        expect(errType(result)).toBe('webhook_missing_connection_id');
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not accept the integration secret', async () => {
        const { nango, execute } = makeNango('affinity');
        withConnection(nango);

        const result = await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoConnectionId: 'conn-1', nangoWebhookSecret: SECRET });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not accept another connection secret', async () => {
        const { nango, execute } = makeNango('affinity');
        withConnection(nango, OTHER_SECRET);

        const result = await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoConnectionId: 'conn-1', nangoWebhookSecret: SECRET });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('answers an unknown connection the same as a wrong secret', async () => {
        const { nango, execute } = makeNango('affinity');
        withConnection(nango, null);

        expect(errType(await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoConnectionId: 'missing', nangoWebhookSecret: SECRET }))).toBe(
            'webhook_invalid_signature'
        );
        expect(errType(await AffinityWebhookRouting.default(nango, {}, body, rawBody, { nangoConnectionId: 'missing' }))).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });
});

describe('fillout webhook routing', () => {
    const body = { type: 'submission', formId: 'form-1' };
    const rawBody = JSON.stringify(body);

    it('routes only to the connections whose secret matches', async () => {
        const { nango } = makeNango('fillout');
        vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockResolvedValue([
            dbConnection('mine', SECRET),
            dbConnection('other', OTHER_SECRET),
            dbConnection('secretless')
        ]);

        const result = await FilloutWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, rawBody, {});

        expect(routedTo(result)).toEqual(['mine']);
    });

    it('routes each event of a batch to its own verified connections', async () => {
        const { nango } = makeNango('fillout');
        vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockImplementation(({ payloadIdentifier }) =>
            Promise.resolve(payloadIdentifier === 'form-1' ? [dbConnection('conn-1', SECRET)] : [dbConnection('conn-2', OTHER_SECRET)])
        );
        const batch = [body, { type: 'submission', formId: 'form-2' }];

        const result = await FilloutWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, batch, JSON.stringify(batch), {});

        expect(routedTo(result)).toEqual(['conn-1']);
    });

    it('rejects when no connection verifies, including an unknown form', async () => {
        const { nango, execute } = makeNango('fillout');
        vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockResolvedValue(null);

        expect(errType(await FilloutWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, rawBody, {}))).toBe('webhook_invalid_signature');
        expect(errType(await FilloutWebhookRouting.default(nango, {}, body, rawBody, {}))).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });
});

describe('shipstation webhook routing', () => {
    const v1Body = { resource_type: 'ORDER_NOTIFY', resource_url: 'https://ssapi.shipstation.com/orders?storeID=123' };
    const rawV1Body = JSON.stringify(v1Body);

    it('checks the connection from x-nango-connection-id against its own secret', async () => {
        const { nango, execute } = makeNango('shipstation-v2');
        withConnection(nango, SECRET);

        const result = await ShipstationWebhookRouting.default(
            nango,
            { 'x-nango-connection-id': 'conn-1', 'x-nango-webhook-secret': SECRET },
            { resource_type: 'fulfillment_shipped_v2', resource_url: 'https://api.shipstation.com/x' },
            '{}',
            {}
        );

        expect(routedTo(result)).toEqual(['conn-1']);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: 'conn-1', propName: 'connectionId' }));
    });

    it('does not let one connection secret post for another connection id', async () => {
        const { nango, execute } = makeNango('shipstation-v2');
        withConnection(nango, OTHER_SECRET);

        const result = await ShipstationWebhookRouting.default(
            nango,
            { 'x-nango-connection-id': 'conn-1', 'x-nango-webhook-secret': SECRET },
            v1Body,
            rawV1Body,
            {}
        );

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a store id only to the matching connections that verify', async () => {
        const { nango } = makeNango('shipstation');
        const lookup = vi
            .spyOn(connectionService, 'findConnectionsByMetadataValue')
            .mockResolvedValue([dbConnection('mine', SECRET), dbConnection('other', OTHER_SECRET)]);

        const result = await ShipstationWebhookRouting.default(nango, {}, v1Body, rawV1Body, { nangoWebhookSecret: SECRET });

        expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ metadataProperty: 'storeId', payloadIdentifier: '123' }));
        expect(routedTo(result)).toEqual(['mine']);
    });

    it('rejects an unknown store id the same as a wrong secret', async () => {
        const { nango, execute } = makeNango('shipstation');
        vi.spyOn(connectionService, 'findConnectionsByMetadataValue').mockResolvedValue(null);

        expect(errType(await ShipstationWebhookRouting.default(nango, {}, v1Body, rawV1Body, { nangoWebhookSecret: SECRET }))).toBe(
            'webhook_invalid_signature'
        );
        expect(execute).not.toHaveBeenCalled();
    });
});
