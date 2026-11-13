import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as MicrosoftEntraIdWebhookRouting from './microsoft-entra-id-webhook-routing.js';

import type { MicrosoftEntraIdNotification, MicrosoftEntraIdNotificationPayload } from './types.js';
import type { NangoError } from '@nangohq/shared';

const CLIENT_STATE = 'a-long-enough-client-state';
const SUBSCRIPTION_ID = '50a3ecb6-cb96-49c0-b120-bb35758c3d5e';
const TENANT_ID = '99998888-7777-6666-5555-444433332222';

const userUpdated: MicrosoftEntraIdNotification = {
    subscriptionId: SUBSCRIPTION_ID,
    subscriptionExpirationDateTime: '2026-12-10T00:00:00.0000000Z',
    clientState: CLIENT_STATE,
    changeType: 'updated',
    resource: 'Users/11112222-3333-4444-5555-666677778888',
    tenantId: TENANT_ID,
    resourceData: {
        '@odata.type': '#Microsoft.Graph.User',
        '@odata.id': 'Users/11112222-3333-4444-5555-666677778888',
        id: '11112222-3333-4444-5555-666677778888',
        organizationId: TENANT_ID
    }
};

const reauthorizationRequired: MicrosoftEntraIdNotification = {
    subscriptionId: SUBSCRIPTION_ID,
    subscriptionExpirationDateTime: '2026-12-10T00:00:00.0000000Z',
    clientState: CLIENT_STATE,
    tenantId: TENANT_ID,
    lifecycleEvent: 'reauthorizationRequired'
};

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function value(result: unknown) {
    return (result as { value: { content: unknown; statusCode: number; connectionIds?: string[]; toForward?: unknown } }).value;
}

function withoutClientState({ clientState: _clientState, ...notification }: MicrosoftEntraIdNotification) {
    return notification;
}

function makeNango({ webhookSecret = CLIENT_STATE }: { webhookSecret?: string | null } = {}) {
    const integration = getTestConfig({ provider: 'microsoft-entra-id' });
    integration.custom = webhookSecret ? { webhookSecret } : null;
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.spyOn(nango, 'executeScriptForWebhooks').mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    return { nango, execute };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('microsoft entra id webhook routing', () => {
    it('echoes the validation token as plain text without routing', async () => {
        const { nango, execute } = makeNango();

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, {}, '', { validationToken: 'token-123' });

        expect(value(result)).toEqual({ content: 'token-123', statusCode: 200 });
        expect(execute).not.toHaveBeenCalled();
    });

    it('routes a change notification by subscriptionId, using changeType as webhook type, and strips clientState', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftEntraIdNotificationPayload = { value: [userUpdated] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(value(result).toForward).toEqual({ value: [withoutClientState(userUpdated)] });
        expect(execute).toHaveBeenCalledWith({
            payload: withoutClientState(userUpdated),
            webhookTypeValue: 'updated',
            connectionIdentifierValue: SUBSCRIPTION_ID,
            propName: 'metadata.subscriptionIds'
        });
    });

    it('routes a lifecycle notification using lifecycleEvent as webhook type', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftEntraIdNotificationPayload = { value: [reauthorizationRequired] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual(['conn-1']);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ webhookTypeValue: 'reauthorizationRequired' }));
    });

    it('drops notifications with a wrong clientState and keeps the rest', async () => {
        const { nango, execute } = makeNango();
        const forged = { ...userUpdated, clientState: 'not-the-client-state' };
        const body: MicrosoftEntraIdNotificationPayload = { value: [forged, reauthorizationRequired] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).toForward).toEqual({ value: [withoutClientState(reauthorizationRequired)] });
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects when no notification has the right clientState', async () => {
        const { nango, execute } = makeNango();
        const body: MicrosoftEntraIdNotificationPayload = { value: [{ ...userUpdated, clientState: 'not-the-client-state' }] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects when the integration has no webhook secret', async () => {
        const { nango, execute } = makeNango({ webhookSecret: null });
        const body: MicrosoftEntraIdNotificationPayload = { value: [userUpdated] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('skips notifications without a subscriptionId', async () => {
        const { nango, execute } = makeNango();
        const { subscriptionId: _subscriptionId, ...noSubscription } = userUpdated;
        const body: MicrosoftEntraIdNotificationPayload = { value: [noSubscription] };

        const result = await MicrosoftEntraIdWebhookRouting.default(nango, {}, body, JSON.stringify(body), {});

        expect(value(result).connectionIds).toEqual([]);
        expect(execute).not.toHaveBeenCalled();
    });
});
