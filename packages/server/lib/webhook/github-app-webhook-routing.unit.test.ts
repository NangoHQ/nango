import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GithubAppWebhookRouting from './github-app-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

import type { NangoError } from '@nangohq/shared';

const flagMocks = vi.hoisted(() => ({ allowUnauthorizedGithubAppWebhook: vi.fn() }));

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ allowUnauthorizedGithubAppWebhook: flagMocks.allowUnauthorizedGithubAppWebhook })
}));

const APP_ID = '123456';
const PRIVATE_KEY = 'private-key';
const APP_LINK = 'https://github.com/apps/nango';
const REMEDIATION = 'Set the Nango webhook secret on the GitHub App';

const body = { action: 'opened', installation: { id: 42 } };
const rawBody = JSON.stringify(body);

function makeNango() {
    const integration = getTestConfig({
        provider: 'github-app',
        oauth_client_id: APP_ID,
        oauth_client_secret: Buffer.from(PRIVATE_KEY, 'ascii').toString('base64'),
        app_link: APP_LINK
    });
    const nango = new InternalNango({
        team: seeders.getTestTeam(),
        environment: seeders.getTestEnvironment(),
        plan: seeders.getTestPlan(),
        integration,
        request: { method: 'POST', path: '/webhook', headers: {}, query: {}, body: null },
        logContextGetter
    });
    const execute = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });
    nango.executeScriptForWebhooks = execute;
    const markUnverified = vi.spyOn(nango, 'markUnverified').mockImplementation(() => undefined);

    return { nango, execute, markUnverified };
}

function sign(payload: string, privateKey = PRIVATE_KEY) {
    const secret = crypto.createHash('sha256').update(`${APP_ID}${privateKey}${APP_LINK}`).digest('hex');

    return `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}

function errType(result: unknown) {
    return (result as { error: NangoError }).error.type;
}

describe('github-app-webhook-routing', () => {
    beforeEach(() => {
        flagMocks.allowUnauthorizedGithubAppWebhook.mockReset();
        flagMocks.allowUnauthorizedGithubAppWebhook.mockResolvedValue(false);
    });

    it('routes a correctly signed webhook', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).not.toHaveBeenCalled();
    });

    it('rejects a signature made with the wrong key before dispatch', async () => {
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody, 'other-key') }, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('rejects a signature over a tampered body before dispatch', async () => {
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody) }, body as never, `${rawBody} `);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });

    it('counts and rejects a missing signature header', async () => {
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isErr()).toBe(true);
        expect(errType(result)).toBe('webhook_missing_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION });
    });

    it('counts and processes a missing signature header when the account is opted out', async () => {
        flagMocks.allowUnauthorizedGithubAppWebhook.mockResolvedValue(true);
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION });
    });
});
