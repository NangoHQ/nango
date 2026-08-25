import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import { InternalNango } from './internal-nango.js';
import * as SlackWebhookRouting from './slack-webhook-routing.js';

function makeNango(mock = vi.fn()) {
    const integration = getTestConfig({ provider: 'slack' });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        logContextGetter
    });
    nango.executeScriptForWebhooks = mock;
    return { nango, mock };
}

const interactivityPayload = {
    type: 'block_actions',
    team_id: 'T123ABC',
    team: { id: 'T123ABC', domain: 'testworkspace' },
    actions: [{ action_id: 'button_click', type: 'button' }]
};

describe('slack-webhook-routing', () => {
    it('forwards interactivity payload with exact content-type', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/x-www-form-urlencoded' },
            { payload: JSON.stringify(interactivityPayload) },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('forwards interactivity payload when content-type includes charset (Slack button clicks)', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
            { payload: JSON.stringify(interactivityPayload) },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('forwards JSON Events API payload (application/json)', async () => {
        const { nango, mock } = makeNango();

        const body = { type: 'event_callback', team_id: 'T123ABC', event: { type: 'message' } };

        const result = await SlackWebhookRouting.default(nango as unknown as InternalNango, { 'content-type': 'application/json' }, body, '');

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('responds to url_verification challenge without calling executeScriptForWebhooks', async () => {
        const { nango, mock } = makeNango();

        const result = await SlackWebhookRouting.default(
            nango as unknown as InternalNango,
            { 'content-type': 'application/json' },
            { type: 'url_verification', challenge: 'abc123' },
            ''
        );

        expect(result.isOk()).toBe(true);
        expect(result.unwrap().statusCode).toBe(200);
        expect(result.unwrap().content).toBe('abc123');
        expect(mock).not.toHaveBeenCalled();
    });
});
