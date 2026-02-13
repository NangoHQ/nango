import { describe, expect, it, vi } from 'vitest';

import route from './jira-webhook-routing.js';

import type { InternalNango } from './internal-nango.js';

function createNangoMock() {
    const mock = vi.fn();
    const nango = { executeScriptForWebhooks: mock } as unknown as InternalNango;
    return { nango, mock };
}

describe('Jira webhook routing', () => {
    it('Should pass correct paths for a single payload', async () => {
        const { nango, mock } = createNangoMock();
        mock.mockResolvedValue({ connectionIds: ['conn-1'], connectionMetadata: {} });

        const body = {
            webhookEvent: 'jira:issue_updated',
            user: { accountId: 'abc-123', displayName: 'Test' },
            issue: { key: 'PROJ-1' }
        };

        const result = await route(nango, {}, body, '');

        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'webhookEvent',
            connectionIdentifier: 'user.accountId',
            propName: 'accountId'
        });
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect('connectionIds' in value && value.connectionIds).toEqual(['conn-1']);
    });

    it('Should handle array payloads and aggregate connectionIds', async () => {
        const { nango, mock } = createNangoMock();
        mock.mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} }).mockResolvedValueOnce({
            connectionIds: ['conn-2'],
            connectionMetadata: {}
        });

        const body = [
            { webhookEvent: 'jira:issue_created', user: { accountId: 'abc-1' } },
            { webhookEvent: 'jira:issue_updated', user: { accountId: 'abc-2' } }
        ];

        const result = await route(nango, {}, body, '');

        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock).toHaveBeenNthCalledWith(1, {
            body: body[0],
            webhookType: 'webhookEvent',
            connectionIdentifier: 'user.accountId',
            propName: 'accountId'
        });
        expect(mock).toHaveBeenNthCalledWith(2, {
            body: body[1],
            webhookType: 'webhookEvent',
            connectionIdentifier: 'user.accountId',
            propName: 'accountId'
        });
        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect('connectionIds' in value && value.connectionIds).toEqual(['conn-1', 'conn-2']);
    });

    it('Should return empty connectionIds when executeScriptForWebhooks returns null', async () => {
        const { nango, mock } = createNangoMock();
        mock.mockResolvedValue(null);

        const body = { webhookEvent: 'jira:issue_deleted', user: { accountId: 'abc-1' } };
        const result = await route(nango, {}, body, '');

        expect(result.isOk()).toBe(true);
        const value = result.unwrap();
        expect('connectionIds' in value && value.connectionIds).toEqual([]);
    });

    it('Should skip events with empty connectionIds in array payload', async () => {
        const { nango, mock } = createNangoMock();
        mock.mockResolvedValueOnce({ connectionIds: ['conn-1'], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: [], connectionMetadata: {} })
            .mockResolvedValueOnce({ connectionIds: ['conn-3'], connectionMetadata: {} });

        const body = [
            { webhookEvent: 'jira:issue_created', user: { accountId: 'abc-1' } },
            { webhookEvent: 'jira:issue_updated', user: { accountId: 'abc-2' } },
            { webhookEvent: 'jira:issue_deleted', user: { accountId: 'abc-3' } }
        ];

        const result = await route(nango, {}, body, '');

        expect(mock).toHaveBeenCalledTimes(3);
        const value = result.unwrap();
        expect('connectionIds' in value && value.connectionIds).toEqual(['conn-1', 'conn-3']);
    });

    it('Should return empty connectionIds for empty array payload', async () => {
        const { nango, mock } = createNangoMock();

        const result = await route(nango, {}, [], '');

        expect(mock).not.toHaveBeenCalled();
        const value = result.unwrap();
        expect('connectionIds' in value && value.connectionIds).toEqual([]);
    });
});
