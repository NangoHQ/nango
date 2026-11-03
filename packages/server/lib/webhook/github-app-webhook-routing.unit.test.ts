import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { connectionService, seeders } from '@nangohq/shared';
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

function makeNango({ allowUnverified = false }: { allowUnverified?: boolean } = {}) {
    const integration = getTestConfig({
        provider: 'github-app',
        allow_unverified_webhooks: allowUnverified,
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

// What the end user typed as the webhook secret of their own GitHub App: GitHub signs with it as is
const CONNECTION_SECRET = 'end-user-webhook-secret';

function signWith(secret: string, payload: string) {
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
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'rejected');
    });

    it('verifies with the integration secret and does not look up connections', async () => {
        const findConnections = vi.spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues');
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody) }, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(findConnections).not.toHaveBeenCalled();
        findConnections.mockRestore();
    });

    it('does not fall back to connection secrets when the integration has an app', async () => {
        const findConnections = vi.spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues');
        const { nango, execute } = makeNango();

        const result = await GithubAppWebhookRouting.default(
            nango,
            { 'x-hub-signature-256': signWith(CONNECTION_SECRET, rawBody), 'x-github-hook-installation-target-id': APP_ID },
            body as never,
            rawBody
        );

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
        expect(findConnections).not.toHaveBeenCalled();
        findConnections.mockRestore();
    });

    describe('integration without an app', () => {
        function makeEmptyNango() {
            const made = makeNango();
            made.nango.integration.oauth_client_id = null;
            made.nango.integration.oauth_client_secret = null;
            made.nango.integration.app_link = null;
            return made;
        }

        function connection(overrides: { provider_config_key?: string; webhook_secret?: string } = {}) {
            return {
                provider_config_key: overrides.provider_config_key ?? 'github-app',
                credentials: {
                    type: 'APP',
                    access_token: 'token',
                    raw: {},
                    config_override: {
                        app_id: APP_ID,
                        private_key: Buffer.from(PRIVATE_KEY, 'ascii').toString('base64'),
                        app_link: APP_LINK,
                        webhook_secret: overrides.webhook_secret ?? CONNECTION_SECRET
                    }
                }
            } as never;
        }

        const headers = (signature: string) => ({ 'x-hub-signature-256': signature, 'x-github-hook-installation-target-id': APP_ID });

        it('verifies with the webhook secret stored on the connection', async () => {
            const { nango, execute } = makeEmptyNango();
            nango.integration.unique_key = 'github-app';
            const findConnections = vi.spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues').mockResolvedValue([connection()]);

            const result = await GithubAppWebhookRouting.default(nango, headers(signWith(CONNECTION_SECRET, rawBody)), body as never, rawBody);

            expect(result.isOk()).toBe(true);
            expect(execute).toHaveBeenCalledOnce();
            expect(findConnections).toHaveBeenCalledWith({ app_id: APP_ID }, nango.environment.id);
            findConnections.mockRestore();
        });

        it('accepts the webhook when any connection of the app matches', async () => {
            const { nango, execute } = makeEmptyNango();
            nango.integration.unique_key = 'github-app';
            const findConnections = vi
                .spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues')
                .mockResolvedValue([connection({ webhook_secret: 'someone-elses-secret' }), connection()]);

            const result = await GithubAppWebhookRouting.default(nango, headers(signWith(CONNECTION_SECRET, rawBody)), body as never, rawBody);

            expect(result.isOk()).toBe(true);
            expect(execute).toHaveBeenCalledOnce();
            findConnections.mockRestore();
        });

        it('rejects a signature made with another secret', async () => {
            const { nango, execute } = makeEmptyNango();
            nango.integration.unique_key = 'github-app';
            const findConnections = vi.spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues').mockResolvedValue([connection()]);

            const result = await GithubAppWebhookRouting.default(nango, headers(signWith('wrong-secret', rawBody)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
            findConnections.mockRestore();
        });

        it('ignores connections of other integrations that share the app id', async () => {
            const { nango, execute } = makeEmptyNango();
            nango.integration.unique_key = 'github-app';
            const findConnections = vi
                .spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues')
                .mockResolvedValue([connection({ provider_config_key: 'another-integration' })]);

            const result = await GithubAppWebhookRouting.default(nango, headers(signWith(CONNECTION_SECRET, rawBody)), body as never, rawBody);

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
            findConnections.mockRestore();
        });

        it('rejects the webhook when the app id header is missing', async () => {
            const { nango, execute } = makeEmptyNango();
            const findConnections = vi.spyOn(connectionService, 'findConnectionsByMultipleConnectionConfigValues');

            const result = await GithubAppWebhookRouting.default(
                nango,
                { 'x-hub-signature-256': signWith(CONNECTION_SECRET, rawBody) },
                body as never,
                rawBody
            );

            expect(errType(result)).toBe('webhook_invalid_signature');
            expect(execute).not.toHaveBeenCalled();
            expect(findConnections).not.toHaveBeenCalled();
            findConnections.mockRestore();
        });
    });

    it('counts and processes a missing signature header when the account is opted out', async () => {
        flagMocks.allowUnauthorizedGithubAppWebhook.mockResolvedValue(true);
        const { nango, execute, markUnverified } = makeNango();

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'flag');
    });

    it('processes a missing signature header when the integration allows unverified webhooks', async () => {
        const { nango, execute, markUnverified } = makeNango({ allowUnverified: true });

        const result = await GithubAppWebhookRouting.default(nango, {}, body as never, rawBody);

        expect(result.isOk()).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        expect(markUnverified).toHaveBeenCalledWith({ reason: 'github_app_missing_signature', remediation: REMEDIATION }, 'setting');
    });

    it('rejects an invalid signature when the integration allows unverified webhooks', async () => {
        const { nango, execute } = makeNango({ allowUnverified: true });

        const result = await GithubAppWebhookRouting.default(nango, { 'x-hub-signature-256': sign(rawBody, 'other-key') }, body as never, rawBody);

        expect(errType(result)).toBe('webhook_invalid_signature');
        expect(execute).not.toHaveBeenCalled();
    });
});
