import { errors } from 'oidc-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl } from '@nangohq/utils';

import { approveOAuthConsent, completeOAuthLogin, getOAuthConsentInteraction, oauthConsentCors } from './interaction.controller.js';

import type * as NangoUtils from '@nangohq/utils';
import type { NextFunction, Request, Response } from 'express';
import type { Interaction } from 'oidc-provider';

const {
    claimOAuthInteractionMock,
    clientFindMock,
    grantAdapterFindMock,
    grantAdapterUpsertMock,
    grantSaveMock,
    interactionDetailsMock,
    interactionResultMock,
    knexMock,
    loggerErrorMock,
    releaseOAuthInteractionMock,
    revokeOAuthGrantMock,
    sessionFindMock
} = vi.hoisted(() => ({
    claimOAuthInteractionMock: vi.fn(),
    clientFindMock: vi.fn(),
    grantAdapterFindMock: vi.fn(),
    grantAdapterUpsertMock: vi.fn(),
    grantSaveMock: vi.fn(),
    interactionDetailsMock: vi.fn(),
    interactionResultMock: vi.fn(),
    knexMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    releaseOAuthInteractionMock: vi.fn(),
    revokeOAuthGrantMock: vi.fn(),
    sessionFindMock: vi.fn()
}));

vi.mock('@nangohq/database', () => ({ default: { knex: knexMock } }));
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoUtils>();
    return { ...actual, getLogger: () => ({ error: loggerErrorMock }) };
});
vi.mock('@nangohq/oauth-server', () => ({
    claimOAuthInteraction: claimOAuthInteractionMock,
    releaseOAuthInteraction: releaseOAuthInteractionMock,
    revokeOAuthGrant: revokeOAuthGrantMock
}));
vi.mock('./server.js', () => ({
    oauthServer: {
        interactionDetails: interactionDetailsMock,
        interactionResult: interactionResultMock,
        Client: { find: clientFindMock },
        Session: { find: sessionFindMock },
        Grant: class Grant {
            static adapter = { find: grantAdapterFindMock, upsert: grantAdapterUpsertMock };
            jti?: string;
            openid?: { scope?: string };
            resources?: Record<string, string>;
            constructor(payload: Record<string, unknown>) {
                Object.assign(this, payload);
            }
            addOIDCScope(scope: string[]) {
                this.openid = { scope: scope.join(' ') };
            }
            addResourceScope(resource: string, scope: string[]) {
                this.resources ??= {};
                this.resources[resource] = scope.join(' ');
            }
            save = grantSaveMock;
        }
    },
    oauthServerConfig: {
        config: { encryptionKey: Buffer.alloc(32, 's').toString('base64') },
        resource: { resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }
    }
}));

describe('OAuth consent interaction controller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        claimOAuthInteractionMock.mockResolvedValue(true);
        grantAdapterUpsertMock.mockResolvedValue(undefined);
        interactionResultMock.mockResolvedValue('https://issuer.example.com/oauth/authorize/resume');
        releaseOAuthInteractionMock.mockResolvedValue(undefined);
        revokeOAuthGrantMock.mockResolvedValue(undefined);
        sessionFindMock.mockResolvedValue({ accountId: '7', loginTs: Date.now() / 1000 - 60 });
        clientFindMock.mockResolvedValue({ clientName: 'Test client', redirectUriAllowed: () => true });
        knexMock.mockImplementation((table: string) => {
            const row = table === '_nango_users' ? { id: 7, account_id: 42, email: 'user@example.com', suspended: false } : { id: 42, uuid: 'account-uuid' };
            const query = {
                where: vi.fn(() => query),
                first: vi.fn(() => Promise.resolve(row))
            };
            return query;
        });
    });

    it('prevents browsers from caching interaction responses', async () => {
        const req = { method: 'GET', get: vi.fn(() => undefined) } as unknown as Request;
        const setHeader = vi.fn();
        const res = { setHeader } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await oauthConsentCors(req, res, next);

        expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(next).toHaveBeenCalledOnce();
    });

    it('reads a login prompt without submitting it', async () => {
        const uid = 'interaction-id';
        const authenticatedAt = Date.now() / 1000 - 60;
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'login', reasons: ['login_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const req = { params: { uid }, user: { id: 7, account_id: 42, authenticated_at: authenticatedAt } } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const res = {
            status,
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await getOAuthConsentInteraction(req, res, next);

        expect(interactionResultMock).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(204);
        expect(next).not.toHaveBeenCalled();
    });

    it('submits a login prompt from an authenticated dashboard POST', async () => {
        const uid = 'interaction-id';
        const authenticatedAt = Date.now() / 1000 - 60;
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'login', reasons: ['login_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const origin = new URL(basePublicUrl).origin;
        const req = {
            params: { uid },
            user: { id: 7, account_id: 42, authenticated_at: authenticatedAt },
            get: vi.fn((name: string) => (name === 'origin' ? origin : undefined))
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const res = {
            status,
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await completeOAuthLogin(req, res, next);

        expect(interactionResultMock).toHaveBeenCalledWith(
            req,
            res,
            { login: { accountId: '7', amr: ['dashboard_session'], ts: authenticatedAt } },
            { mergeWithLastSubmission: false }
        );
        expect(status).toHaveBeenCalledWith(200);
        expect(next).not.toHaveBeenCalled();
    });

    it('does not submit a login prompt without the dashboard origin', async () => {
        const req = {
            params: { uid: 'interaction-id' },
            user: { id: 7, account_id: 42, authenticated_at: Date.now() / 1000 - 60 },
            get: vi.fn(() => undefined)
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await completeOAuthLogin(req, res, next);

        expect(status).toHaveBeenCalledWith(403);
        expect(send).toHaveBeenCalledWith({ error: { code: 'invalid_origin', message: 'This authorization request is invalid' } });
        expect(interactionDetailsMock).not.toHaveBeenCalled();
        expect(interactionResultMock).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('requires a fresh login when the dashboard session has no authentication time', async () => {
        const uid = 'interaction-id';
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'login', reasons: ['login_prompt'], details: {} },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const req = { params: { uid }, user: { id: 7, account_id: 42 } } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await getOAuthConsentInteraction(req, res, next);

        expect(status).toHaveBeenCalledWith(401);
        expect(send).toHaveBeenCalledWith({ error: { code: 'login_required', message: 'Sign in to continue' } });
        expect(interactionResultMock).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('does not approve consent after the dashboard session ends', async () => {
        const uid = 'interaction-id';
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'consent', reasons: ['consent_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const origin = new URL(basePublicUrl).origin;
        const req = {
            params: { uid },
            get: vi.fn((name: string) => (name === 'origin' ? origin : undefined))
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(status).toHaveBeenCalledWith(401);
        expect(send).toHaveBeenCalledWith({ error: { code: 'login_required', message: 'Sign in to continue' } });
        expect(claimOAuthInteractionMock).not.toHaveBeenCalled();
        expect(interactionResultMock).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('does not show consent after the dashboard session ends', async () => {
        const uid = 'interaction-id';
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'consent', reasons: ['consent_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {},
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const req = { params: { uid } } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await getOAuthConsentInteraction(req, res, next);

        expect(status).toHaveBeenCalledWith(401);
        expect(send).toHaveBeenCalledWith({ error: { code: 'login_required', message: 'Sign in to continue' } });
        expect(clientFindMock).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('restores an existing grant if consent submission fails after saving it', async () => {
        const uid = 'interaction-id';
        const previousGrant = {
            kind: 'Grant',
            jti: 'existing-grant',
            accountId: '7',
            clientId: 'https://client.example.com/metadata.json',
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + 600,
            resources: { 'https://mcp.example.com/mcp': 'environment:read' }
        };
        grantAdapterFindMock.mockResolvedValue(previousGrant);
        grantSaveMock.mockResolvedValue('existing-grant');
        const submissionError = new Error('failed to save the consent result');
        interactionResultMock.mockRejectedValue(submissionError);
        interactionDetailsMock.mockResolvedValue({
            uid,
            exp: Math.floor(Date.now() / 1000) + 600,
            prompt: { name: 'consent', reasons: ['consent_prompt'], details: {} },
            session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
            params: {
                client_id: 'https://client.example.com/metadata.json',
                redirect_uri: 'https://client.example.com/callback',
                resource: 'https://mcp.example.com/mcp',
                scope: 'environment:*'
            },
            grantId: 'existing-grant',
            returnTo: 'https://issuer.example.com/oauth/authorize/resume'
        } satisfies Partial<Interaction>);
        const origin = new URL(basePublicUrl).origin;
        const req = {
            params: { uid },
            user: { id: 7, account_id: 42, authenticated_at: Date.now() / 1000 - 60 },
            get: vi.fn((name: string) => (name === 'origin' ? origin : undefined))
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const res = { status, send: vi.fn().mockReturnThis() } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(grantAdapterUpsertMock).toHaveBeenCalledWith('existing-grant', previousGrant);
        expect(previousGrant.resources).toStrictEqual({ 'https://mcp.example.com/mcp': 'environment:read' });
        expect(revokeOAuthGrantMock).not.toHaveBeenCalled();
        expect(releaseOAuthInteractionMock).toHaveBeenCalledWith(expect.objectContaining({ interactionId: uid }));
        expect(next).toHaveBeenCalledWith(submissionError);
    });

    it('invalidates an interaction whose existing grant was revoked while consent was open', async () => {
        const uid = 'interaction-id';
        grantAdapterFindMock.mockResolvedValue(undefined);
        interactionDetailsMock.mockResolvedValue(consentInteraction(uid));
        const req = consentRequest(uid);
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(status).toHaveBeenCalledWith(404);
        expect(send).toHaveBeenCalledWith({ error: { code: 'interaction_invalid', message: 'This authorization request is invalid' } });
        expect(grantSaveMock).not.toHaveBeenCalled();
        expect(interactionResultMock).not.toHaveBeenCalled();
        expect(releaseOAuthInteractionMock).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('does not compensate a grant after the consent result was persisted', async () => {
        const uid = 'interaction-id';
        const previousGrant = {
            kind: 'Grant',
            jti: 'existing-grant',
            accountId: '7',
            clientId: 'https://client.example.com/metadata.json',
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + 600,
            resources: { 'https://mcp.example.com/mcp': 'environment:read' }
        };
        grantAdapterFindMock.mockResolvedValue(previousGrant);
        grantSaveMock.mockResolvedValue('existing-grant');
        interactionDetailsMock.mockResolvedValue(consentInteraction(uid));
        const responseError = new Error('failed to send the response');
        const req = consentRequest(uid);
        const status = vi.fn().mockReturnThis();
        const send = vi.fn(() => {
            throw responseError;
        });
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(interactionResultMock).toHaveBeenCalledWith(req, res, { consent: { grantId: 'existing-grant' } });
        expect(grantAdapterUpsertMock).not.toHaveBeenCalled();
        expect(revokeOAuthGrantMock).not.toHaveBeenCalled();
        expect(releaseOAuthInteractionMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(responseError);
    });

    it('preserves a typed interaction error when grant compensation fails', async () => {
        const uid = 'interaction-id';
        const previousGrant = {
            kind: 'Grant',
            jti: 'existing-grant',
            accountId: '7',
            clientId: 'https://client.example.com/metadata.json',
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + 600,
            resources: { 'https://mcp.example.com/mcp': 'environment:read' }
        };
        grantAdapterFindMock.mockResolvedValue(previousGrant);
        grantSaveMock.mockResolvedValue('existing-grant');
        const interactionError = new errors.SessionNotFound('authorization request has expired');
        interactionResultMock.mockRejectedValue(interactionError);
        const compensationError = new Error('failed to restore the grant');
        grantAdapterUpsertMock.mockRejectedValue(compensationError);
        interactionDetailsMock.mockResolvedValue(consentInteraction(uid));
        const req = consentRequest(uid);
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(grantAdapterUpsertMock).toHaveBeenCalledWith('existing-grant', previousGrant);
        expect(releaseOAuthInteractionMock).not.toHaveBeenCalled();
        expect(loggerErrorMock).toHaveBeenCalledWith('Failed to compensate OAuth grant after consent submission failed', {
            error: compensationError,
            interactionId: uid,
            operation: 'restore_existing_grant'
        });
        expect(status).toHaveBeenCalledWith(410);
        expect(send).toHaveBeenCalledWith({ error: { code: 'interaction_expired', message: 'This authorization request has expired' } });
        expect(next).not.toHaveBeenCalled();
    });

    it('preserves the original interaction error when releasing the claim fails', async () => {
        const uid = 'interaction-id';
        const previousGrant = {
            kind: 'Grant',
            jti: 'existing-grant',
            accountId: '7',
            clientId: 'https://client.example.com/metadata.json',
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + 600,
            resources: { 'https://mcp.example.com/mcp': 'environment:read' }
        };
        grantAdapterFindMock.mockResolvedValue(previousGrant);
        grantSaveMock.mockResolvedValue('existing-grant');
        const interactionError = new errors.SessionNotFound('authorization request has expired');
        interactionResultMock.mockRejectedValue(interactionError);
        const releaseError = new Error('failed to release the interaction');
        releaseOAuthInteractionMock.mockRejectedValue(releaseError);
        interactionDetailsMock.mockResolvedValue(consentInteraction(uid));
        const req = consentRequest(uid);
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await approveOAuthConsent(req, res, next);

        expect(grantAdapterUpsertMock).toHaveBeenCalledWith('existing-grant', previousGrant);
        expect(releaseOAuthInteractionMock).toHaveBeenCalledWith(expect.objectContaining({ interactionId: uid }));
        expect(loggerErrorMock).toHaveBeenCalledWith(
            'Failed to release OAuth interaction after consent submission failed',
            expect.objectContaining({ error: releaseError, interactionId: uid })
        );
        expect(status).toHaveBeenCalledWith(410);
        expect(send).toHaveBeenCalledWith({ error: { code: 'interaction_expired', message: 'This authorization request has expired' } });
        expect(next).not.toHaveBeenCalled();
    });
});

function consentInteraction(uid: string): Partial<Interaction> {
    return {
        uid,
        exp: Math.floor(Date.now() / 1000) + 600,
        prompt: { name: 'consent', reasons: ['consent_prompt'], details: {} },
        session: { accountId: '7', uid: 'session-uid', cookie: 'session-cookie' },
        params: {
            client_id: 'https://client.example.com/metadata.json',
            redirect_uri: 'https://client.example.com/callback',
            resource: 'https://mcp.example.com/mcp',
            scope: 'environment:*'
        },
        grantId: 'existing-grant',
        returnTo: 'https://issuer.example.com/oauth/authorize/resume'
    } satisfies Partial<Interaction>;
}

function consentRequest(uid: string): Request {
    const origin = new URL(basePublicUrl).origin;
    return {
        params: { uid },
        user: { id: 7, account_id: 42, authenticated_at: Date.now() / 1000 - 60 },
        get: vi.fn((name: string) => (name === 'origin' ? origin : undefined))
    } as unknown as Request;
}
