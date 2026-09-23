import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as StreakWebhookRouting from './streak-webhook-routing.js';

import type { NangoError } from '@nangohq/shared';

const TOKEN = 'streak-token-0123456789abcdef';
const body = [{ eventType: 'BOX_EDITED' }];
const rawBody = JSON.stringify(body);

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

function makeNango(connectionIds: string[] = ['conn-1']) {
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration: getTestConfig({ provider: 'streak' }),
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds, connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    return { nango, execute };
}

function mockConnection(token: string | null) {
    vi.spyOn(connectionService, 'getConnection').mockResolvedValue({
        success: token !== null,
        error: null,
        response: token === null ? null : ({ connection_id: 'conn-1', connection_config: { streakWebhookToken: token } } as never)
    });
}

describe('streak-webhook-routing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects a request without a token', async () => {
        const { nango } = makeNango();

        expect(errType(await StreakWebhookRouting.default(nango, {}, body, rawBody, {}))).toBe('webhook_missing_token');
    });

    it('routes by token lookup when no connection id is given', async () => {
        const { nango, execute } = makeNango();

        const result = await StreakWebhookRouting.default(nango, { 'x-streak-webhook-token': TOKEN }, body, rawBody, {});

        expect(result.isOk() && result.value.statusCode).toBe(200);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: TOKEN, propName: 'streakWebhookToken' }));
    });

    it('does not forward a token that matches no connection', async () => {
        const { nango } = makeNango([]);

        const result = await StreakWebhookRouting.default(nango, { 'x-streak-webhook-token': 'unknown' }, body, rawBody, {});

        expect(result.isOk() && result.value.statusCode).toBe(204);
    });

    it('checks the token against the connection given in nangoConnectionId', async () => {
        mockConnection(TOKEN);
        const { nango, execute } = makeNango();

        const result = await StreakWebhookRouting.default(nango, { 'x-streak-webhook-token': TOKEN }, body, rawBody, { nangoConnectionId: 'conn-1' });

        expect(result.isOk() && result.value.statusCode).toBe(200);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ connectionIdentifierValue: 'conn-1', propName: 'connectionId' }));
    });

    it('rejects a token that does not match the given connection', async () => {
        mockConnection(TOKEN);
        const { nango, execute } = makeNango();

        const result = await StreakWebhookRouting.default(nango, { 'x-streak-webhook-token': 'wrong' }, body, rawBody, { nangoConnectionId: 'conn-1' });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('gives an unknown connection the same answer as a wrong token', async () => {
        mockConnection(null);
        const { nango, execute } = makeNango();

        const result = await StreakWebhookRouting.default(nango, { 'x-streak-webhook-token': TOKEN }, body, rawBody, { nangoConnectionId: 'missing' });

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });
});
