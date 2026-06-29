import { describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { getTestConfig } from '@nangohq/shared/lib/seeders/config.seeder.js';

import * as GitlabWebhookRouting from './gitlab-webhook-routing.js';
import { InternalNango } from './internal-nango.js';

const SECRET = 'test-webhook-token';

function getIntegration({ withSecret = true }: { withSecret?: boolean } = {}) {
    return getTestConfig({ provider: 'gitlab', custom: withSecret ? { webhookSecret: SECRET } : {} });
}

describe('Gitlab webhook routing', () => {
    it('Should route by nangoConnectionId query param and X-Gitlab-Event header', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'issue', project: { id: 42 } };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-token': SECRET, 'x-gitlab-event': 'Issue Hook' };
        const query = { nangoConnectionId: 'my-connection-id' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookHeaderValue: 'Issue Hook',
            connectionIdentifierValue: 'my-connection-id',
            propName: 'connectionId'
        });
    });

    it('Should fall back to nangoConnectionId in the body when absent from the query', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'merge_request', nangoConnectionId: 'body-connection-id' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-token': SECRET, 'x-gitlab-event': 'Merge Request Hook' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, {});

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookHeaderValue: 'Merge Request Hook',
            connectionIdentifierValue: 'body-connection-id',
            propName: 'connectionId'
        });
    });

    it('Should allow the request through when no secret is configured', async () => {
        const integration = getIntegration({ withSecret: false });

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'note' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-event': 'Note Hook' };
        const query = { nangoConnectionId: 'my-connection-id' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, query);

        expect(result.isOk()).toBe(true);
        expect(mock).toHaveBeenCalledOnce();
    });

    it('Should reject a webhook whose X-Gitlab-Token does not match the configured secret', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-token': 'wrong-token', 'x-gitlab-event': 'Issue Hook' };
        const query = { nangoConnectionId: 'my-connection-id' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, query);

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('Should reject a webhook with a missing X-Gitlab-Token when a secret is configured', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-event': 'Issue Hook' };
        const query = { nangoConnectionId: 'my-connection-id' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, query);

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('Should reject a webhook with no connection id', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'issue' };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-token': SECRET, 'x-gitlab-event': 'Issue Hook' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, {});

        expect(result.isErr()).toBe(true);
        expect(mock).not.toHaveBeenCalled();
    });

    it('Should forward the full body on success', async () => {
        const integration = getIntegration();

        const mock = vi.fn();
        const nangoMock = new InternalNango({
            team: seeders.getTestTeam(),
            environment: seeders.getTestEnvironment(),
            plan: seeders.getTestPlan(),
            integration,
            logContextGetter
        });
        nangoMock.executeScriptForWebhooks = mock;

        const body = { object_kind: 'issue', project: { id: 7 } };
        const rawBody = JSON.stringify(body);
        const headers = { 'x-gitlab-token': SECRET, 'x-gitlab-event': 'Issue Hook' };
        const query = { nangoConnectionId: 'my-connection-id' };

        const result = await GitlabWebhookRouting.default(nangoMock as unknown as InternalNango, headers, body, rawBody, query);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            const value = result.value as { toForward: unknown; statusCode: number; content: unknown };
            expect(value.toForward).toEqual(body);
            expect(value.statusCode).toBe(200);
            expect(value.content).toEqual({ status: 'success' });
        }
    });
});
