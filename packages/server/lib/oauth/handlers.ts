import { OAuthProviderErrors } from '@nangohq/oauth-server';
import { report } from '@nangohq/utils';

import { asyncWrapper } from '../utils/asyncWrapper.js';
import { oauthConsent } from './server.js';
import { decisionBody, emptyObject, interactionParams, OAuthConsentError } from './validation.js';

import type { RequestLocals } from '../utils/express.js';
import type { OAuthConsentService } from './service.js';
import type { GetOAuthInteraction, PostOAuthApprove, PostOAuthDeny } from '@nangohq/types';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';

export const oauthParsingError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    const type = err && typeof err === 'object' && 'type' in err ? err.type : undefined;
    const tooLarge = type === 'entity.too.large';
    const invalidBody = type === 'entity.parse.failed' || type === 'request.aborted' || type === 'encoding.unsupported' || type === 'charset.unsupported';
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.status(tooLarge ? 413 : invalidBody ? 400 : 500).json({
        error: { code: tooLarge ? 'request_too_large' : invalidBody ? 'invalid_body' : 'server_error' }
    });
};

export function consent(): OAuthConsentService {
    if (!oauthConsent) throw new OAuthConsentError(403, 'feature_disabled');
    return oauthConsent;
}

async function handleOAuthErrors(res: Response, fn: () => Promise<void>): Promise<void> {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    try {
        await fn();
    } catch (err) {
        const expected =
            err instanceof OAuthConsentError
                ? err
                : err instanceof OAuthProviderErrors.SessionNotFound
                  ? new OAuthConsentError(410, 'interaction_expired')
                  : err instanceof OAuthProviderErrors.InvalidClient ||
                      err instanceof OAuthProviderErrors.InvalidClientMetadata ||
                      err instanceof OAuthProviderErrors.InvalidRequest
                    ? new OAuthConsentError(400, 'invalid_interaction')
                    : null;
        // Provider and database errors can contain credentials. Return only a bounded error
        // vocabulary; never pass the original error to the generic request/error logger.
        if (!expected) report(new Error('oauth_consent_unexpected_error'));
        res.status(expected?.status ?? 500).json({ error: { code: expected?.code ?? 'server_error' } });
    }
}

function uid(req: Request): string {
    const result = interactionParams.safeParse(req.params);
    if (!result.success) throw new OAuthConsentError(400, 'invalid_interaction');
    if (!emptyObject.safeParse(req.query).success) throw new OAuthConsentError(400, 'invalid_query_params');
    return result.data.uid;
}

export const enterOAuthInteraction: RequestHandler<any, any, any, any, RequestLocals> = async (req, res) => {
    await handleOAuthErrors(res, async () => {
        await consent().enter(req, res, uid(req));
    });
};
export const readOAuthInteraction = asyncWrapper<GetOAuthInteraction>(async (req, res) => {
    await handleOAuthErrors(res, async () => {
        res.json({ data: await consent().read(req, res, uid(req)) });
    });
});
export const authenticateOAuthSession: RequestHandler<any, any, any, any, RequestLocals> = async (req, res, next) => {
    await handleOAuthErrors(res, async () => {
        await consent().session(req, res);
        next();
    });
};
export const approveOAuthInteraction = asyncWrapper<PostOAuthApprove>(async (req, res) => {
    await handleOAuthErrors(res, async () => {
        const body = decisionBody.safeParse(req.body);
        if (!body.success) throw new OAuthConsentError(400, 'invalid_body');
        res.json({ data: await consent().decide(req, res, uid(req), body.data.csrfToken, true) });
    });
});
export const denyOAuthInteraction = asyncWrapper<PostOAuthDeny>(async (req, res) => {
    await handleOAuthErrors(res, async () => {
        const body = decisionBody.safeParse(req.body);
        if (!body.success) throw new OAuthConsentError(400, 'invalid_body');
        res.json({ data: await consent().decide(req, res, uid(req), body.data.csrfToken, false) });
    });
});
