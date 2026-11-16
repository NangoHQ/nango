import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as CommandAlkonWebhookRouting from './command-alkon-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';
import type { DBConnectionDecrypted } from '@nangohq/types';

const SECRET = 'a-long-enough-webhook-secret';
const OTHER_SECRET = 'another-long-enough-secret';

const ticketEvent = { entityRef: 'entity-1', itemRef: 'ticket-1', itemTypeId: 'ticket', changeType: 'update', timestamp: '2026-10-01T00:00:00Z', detail: {} };
const orderEvent = { entityRef: 'entity-1', itemRef: 'order-1', itemTypeId: 'order', changeType: 'add', timestamp: '2026-10-01T00:00:00Z', detail: {} };
const otherEntityEvent = { ...ticketEvent, entityRef: 'entity-2' };

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function value(result: unknown) {
    return (result as { value: { connectionIds: string[]; toForward: unknown } }).value;
}

function dbConnection(connectionId: string, webhookSecret?: string) {
    return { connection_id: connectionId, metadata: webhookSecret ? { webhookSecret } : null } as unknown as DBConnectionDecrypted;
}

function makeNango({ allowUnverifiedWebhooks = false }: { allowUnverifiedWebhooks?: boolean } = {}) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'command-alkon', allow_unverified_webhooks: allowUnverifiedWebhooks }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn(({ connectionIdentifierValue }: { connectionIdentifierValue?: string }) =>
        Promise.resolve({ connectionIds: connectionIdentifierValue ? [connectionIdentifierValue] : [], connectionMetadata: {} })
    );
    nango.executeScriptForWebhooks = execute;
    return { nango, execute };
}

function withConnections(byEntity: Record<string, DBConnectionDecrypted[]>) {
    return vi
        .spyOn(connectionService, 'findConnectionsByConnectionConfigValue')
        .mockImplementation((_key, entityRef) => Promise.resolve(byEntity[entityRef] ?? null));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('command alkon webhook routing', () => {
    it('routes every event of a delivery to the connection of its entity, using the item type as webhook type', async () => {
        const { nango, execute } = makeNango();
        const lookup = withConnections({ 'entity-1': [dbConnection('conn-1', SECRET)] });
        const body = [ticketEvent, orderEvent];

        const result = await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).toForward).toEqual(body);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('entityRef', 'entity-1', nango.environment.id, nango.integration.id);
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ payload: orderEvent, webhookType: 'itemTypeId', connectionIdentifierValue: 'conn-1', propName: 'connectionId' })
        );
    });

    it('routes only to the connections whose secret matches', async () => {
        const { nango } = makeNango();
        withConnections({ 'entity-1': [dbConnection('mine', SECRET), dbConnection('other', OTHER_SECRET), dbConnection('secretless')] });

        const result = await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, [ticketEvent], '', {});

        expect(value(result).connectionIds).toEqual(['mine']);
    });

    it('forwards only the events of entities that verified', async () => {
        const { nango } = makeNango();
        withConnections({ 'entity-1': [dbConnection('conn-1', SECRET)], 'entity-2': [dbConnection('conn-2', OTHER_SECRET)] });
        const body = [ticketEvent, otherEntityEvent];

        const result = await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).toForward).toEqual([ticketEvent]);
    });

    it('rejects a delivery with an event missing entityRef without looking up connections', async () => {
        const { nango, execute } = makeNango();
        const lookup = withConnections({ 'entity-1': [dbConnection('conn-1', SECRET)] });

        expect(
            errType(await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, [ticketEvent, { itemTypeId: 'ticket' }], '', {}))
        ).toBe('webhook_invalid_body');
        expect(errType(await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, [], '', {}))).toBe('webhook_invalid_body');
        expect(lookup).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when no connection verifies, including an unknown entity', async () => {
        const { nango, execute } = makeNango();
        withConnections({ 'entity-1': [dbConnection('conn-1', OTHER_SECRET)] });

        expect(errType(await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, [ticketEvent], '', {}))).toBe(
            'webhook_invalid_signature'
        );
        expect(errType(await CommandAlkonWebhookRouting.default(nango, { 'x-nango-webhook-secret': SECRET }, [otherEntityEvent], '', {}))).toBe(
            'webhook_invalid_signature'
        );
        expect(errType(await CommandAlkonWebhookRouting.default(nango, {}, [ticketEvent], '', {}))).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a connection without a secret only when the integration allows unverified webhooks', async () => {
        withConnections({ 'entity-1': [dbConnection('secretless')] });

        const rejected = makeNango();
        expect(errType(await CommandAlkonWebhookRouting.default(rejected.nango, {}, [ticketEvent], '', {}))).toBe('webhook_missing_signature');

        const allowed = makeNango({ allowUnverifiedWebhooks: true });
        expect(value(await CommandAlkonWebhookRouting.default(allowed.nango, {}, [ticketEvent], '', {})).connectionIds).toEqual(['secretless']);
    });
});
