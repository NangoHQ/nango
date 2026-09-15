import { beforeEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl } from '@nangohq/utils';

import { getOAuthConsentInteraction, oauthConsentCors } from './interaction.controller.js';

import type { NextFunction, Request, Response } from 'express';
import type { Interaction } from 'oidc-provider';

const { knexMock, interactionDetailsMock, interactionResultMock } = vi.hoisted(() => ({
    knexMock: vi.fn(),
    interactionDetailsMock: vi.fn(),
    interactionResultMock: vi.fn()
}));

vi.mock('@nangohq/database', () => ({ default: { knex: knexMock } }));
vi.mock('./server.js', () => ({
    oauthServer: { interactionDetails: interactionDetailsMock, interactionResult: interactionResultMock },
    oauthServerConfig: null
}));

describe('OAuth consent interaction controller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        interactionResultMock.mockResolvedValue('https://issuer.example.com/oauth/authorize/resume');
        knexMock.mockImplementation((table: string) => {
            const row = table === '_nango_users' ? { id: 7, account_id: 42, email: 'user@example.com', suspended: false } : { id: 42, uuid: 'account-uuid' };
            const query = {
                where: vi.fn(() => query),
                first: vi.fn(() => Promise.resolve(row))
            };
            return query;
        });
    });

    it('allows dashboard requests carrying Sentry tracing headers', () => {
        const origin = new URL(basePublicUrl).origin;
        const req = {
            method: 'OPTIONS',
            get: vi.fn((name: string) => (name === 'origin' ? origin : undefined))
        } as unknown as Request;
        const setHeader = vi.fn();
        const sendStatus = vi.fn();
        const res = { setHeader, sendStatus } as unknown as Response;
        const next = vi.fn() as NextFunction;

        oauthConsentCors(req, res, next);

        expect(setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', origin);
        expect(setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, sentry-trace, baggage');
        expect(sendStatus).toHaveBeenCalledWith(204);
        expect(next).not.toHaveBeenCalled();
    });

    it('honors prompt=login even when an OAuth session already exists', async () => {
        const uid = 'interaction-id';
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'login', reasons: ['login_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const req = { params: { uid }, user: { id: 7, account_id: 42 } } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const res = {
            status,
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await getOAuthConsentInteraction(req, res, next);

        const submitted = interactionResultMock.mock.calls[0]?.[2] as { login: { accountId: string; amr: string[]; ts: number } };
        expect(interactionResultMock).toHaveBeenCalledWith(
            req,
            res,
            { login: { accountId: '7', amr: ['dashboard_session'], ts: submitted.login.ts } },
            { mergeWithLastSubmission: false }
        );
        expect(typeof submitted.login.ts).toBe('number');
        expect(status).toHaveBeenCalledWith(202);
        expect(next).not.toHaveBeenCalled();
    });
});
