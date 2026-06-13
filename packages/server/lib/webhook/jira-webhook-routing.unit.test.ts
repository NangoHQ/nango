import { describe, expect, it, vi } from 'vitest';

import * as JiraWebhookRouting from './jira-webhook-routing.js';

const makeNango = (mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-1'] })) => {
    return { executeScriptForWebhooks: mock };
};

describe('jira-webhook-routing', () => {
    it('routes issue webhooks by Jira site baseUrl from issue.self', async () => {
        const mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-issue'] });
        const nango = makeNango(mock);
        const body = {
            webhookEvent: 'jira:issue_updated',
            issue: {
                self: 'https://acme.atlassian.net/rest/api/2/issue/42766',
                id: '42766'
            },
            user: {
                accountId: 'actor-account-id'
            }
        };

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[] }).connectionIds).toEqual(['conn-issue']);
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'webhookEvent',
            connectionIdentifierValue: 'https://acme.atlassian.net',
            propName: 'baseUrl'
        });
    });

    it('routes comment webhooks by comment.self when the root user is absent', async () => {
        const mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-comment'] });
        const nango = makeNango(mock);
        const body = {
            webhookEvent: 'comment_created',
            comment: {
                self: 'https://acme.atlassian.net/rest/api/2/issue/42766/comment/61142',
                author: {
                    accountId: 'comment-author-id'
                }
            }
        };

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[] }).connectionIds).toEqual(['conn-comment']);
        expect(mock).toHaveBeenCalledWith({
            body,
            webhookType: 'webhookEvent',
            connectionIdentifierValue: 'https://acme.atlassian.net',
            propName: 'baseUrl'
        });
    });

    it('routes batched Jira events independently and combines matched connection ids', async () => {
        const mock = vi
            .fn()
            .mockResolvedValueOnce({ connectionIds: ['conn-a'] })
            .mockResolvedValueOnce({ connectionIds: ['conn-b'] });
        const nango = makeNango(mock);
        const body = [
            {
                webhookEvent: 'jira:issue_created',
                issue: {
                    self: 'https://acme.atlassian.net/rest/api/2/issue/10001'
                }
            },
            {
                webhookEvent: 'comment_created',
                comment: {
                    self: 'https://globex.atlassian.net/rest/api/2/issue/10002/comment/10003'
                }
            }
        ];

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[] }).connectionIds).toEqual(['conn-a', 'conn-b']);
        expect(mock).toHaveBeenNthCalledWith(1, {
            body: body[0],
            webhookType: 'webhookEvent',
            connectionIdentifierValue: 'https://acme.atlassian.net',
            propName: 'baseUrl'
        });
        expect(mock).toHaveBeenNthCalledWith(2, {
            body: body[1],
            webhookType: 'webhookEvent',
            connectionIdentifierValue: 'https://globex.atlassian.net',
            propName: 'baseUrl'
        });
    });

    it('does not execute webhook scripts when a single event has no Jira baseUrl', async () => {
        const mock = vi.fn();
        const nango = makeNango(mock);
        const body = {
            webhookEvent: 'jira:issue_deleted',
            issue: {
                id: '42766'
            }
        };

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[]; toForward: unknown }).connectionIds).toEqual([]);
        expect((result.unwrap() as { connectionIds: string[]; toForward: unknown }).toForward).toBe(body);
        expect(mock).not.toHaveBeenCalled();
    });

    it('skips unroutable events in a Jira batch without executing a broad fallback', async () => {
        const mock = vi.fn().mockResolvedValue({ connectionIds: ['conn-routed'] });
        const nango = makeNango(mock);
        const body = [
            {
                webhookEvent: 'jira:issue_updated',
                issue: {
                    id: '10001'
                }
            },
            {
                webhookEvent: 'comment_created',
                comment: {
                    self: 'https://globex.atlassian.net/rest/api/2/issue/10002/comment/10003'
                }
            }
        ];

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[] }).connectionIds).toEqual(['conn-routed']);
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock).toHaveBeenCalledWith({
            body: body[1],
            webhookType: 'webhookEvent',
            connectionIdentifierValue: 'https://globex.atlassian.net',
            propName: 'baseUrl'
        });
    });

    it('handles deeply nested Jira payloads without recursive stack overflow', async () => {
        const mock = vi.fn();
        const nango = makeNango(mock);
        const body: Record<string, unknown> = {
            webhookEvent: 'jira:issue_updated'
        };
        let cursor = body;

        for (let index = 0; index < 5_000; index++) {
            const child: Record<string, unknown> = {};
            cursor['child'] = child;
            cursor = child;
        }

        const result = await JiraWebhookRouting.default(nango as any, {}, body, '');

        expect(result.isOk()).toBe(true);
        expect((result.unwrap() as { connectionIds: string[] }).connectionIds).toEqual([]);
        expect(mock).not.toHaveBeenCalled();
    });
});
