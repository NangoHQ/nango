import { randomBytes } from 'node:crypto';

import { errors } from 'oidc-provider';
import { z } from 'zod';

import db from '@nangohq/database';
import { claimOAuthInteraction, releaseOAuthInteraction, revokeOAuthGrant } from '@nangohq/oauth-server';
import { basePublicUrl, getLogger, requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { oauthServer, oauthServerConfig } from './server.js';

import type { DBTeam, DBUser, OAuthConsentErrorCode, OAuthConsentInteraction, OAuthConsentResource } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AdapterPayload, Client, Interaction } from 'oidc-provider';

const routeParamsSchema = z
    .object({
        uid: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[A-Za-z0-9_-]+$/)
    })
    .strict();
const DASHBOARD_ORIGIN = new URL(basePublicUrl).origin;
const logger = getLogger('Server.OAuthInteraction');
type ValidatedOAuthResource = OAuthConsentResource & { resource: string };

export const oauthConsentCors: RequestHandler = (req, res, next) => {
    // OAuth interactions are short-lived and can change after every request. In
    // particular, Firefox may otherwise reuse a cached GET while login is being
    // resumed and show stale interaction state.
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin === DASHBOARD_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', DASHBOARD_ORIGIN);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, sentry-trace, baggage');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
        res.sendStatus(origin === DASHBOARD_ORIGIN ? 204 : 403);
        return;
    }
    next();
};

export const getOAuthConsentInteraction: RequestHandler = async (req, res, next) => {
    try {
        const uid = parseUid(req, res);
        if (!uid) return;
        const interaction = await readProviderInteraction(req, res, uid, { allowSubmittedLogin: true });
        if (!interaction) return;

        if (interaction.prompt.name === 'login') {
            const dashboardLogin = await validateDashboardLogin(req, res);
            if (!dashboardLogin) return;
            if (interaction.result?.login) {
                if (interaction.result.login.accountId !== String(dashboardLogin.user.id)) {
                    sendError(res, 409, 'interaction_completed');
                    return;
                }
                res.status(202).send({ data: { resumeUrl: interaction.returnTo } });
                return;
            }

            // Reading an interaction must not advance the OAuth flow. The dashboard follows this with
            // the origin-checked POST below, which prevents a cross-site navigation from submitting a login.
            res.status(204).send();
            return;
        }

        if (!interaction.session) {
            sendError(res, 404, 'interaction_invalid');
            return;
        }
        const dashboardLogin = await validateDashboardLogin(req, res);
        if (!dashboardLogin || !requireMatchingDashboardUser(interaction, dashboardLogin.user, res)) return;

        const context = await validateInteraction(interaction);
        if ('error' in context) {
            sendError(res, context.status, context.error);
            return;
        }
        res.status(200).send({
            data: {
                client: context.client,
                redirectUri: context.redirectUri,
                account: { name: boundedText(context.account.name, 120, 'Nango account') },
                resource: {
                    hostname: context.resource.hostname,
                    scopes: context.resource.scopes
                }
            } satisfies OAuthConsentInteraction
        });
    } catch (err) {
        handleInteractionError(err, res, next);
    }
};

export const completeOAuthLogin: RequestHandler = async (req, res, next) => {
    try {
        const uid = parseUid(req, res);
        if (!uid || !requireExpectedOrigin(req, res)) return;
        const emptyBody = requireEmptyBody(req);
        if (emptyBody) {
            res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
            return;
        }
        const interaction = await readProviderInteraction(req, res, uid, { allowSubmittedLogin: true });
        if (!interaction) return;
        if (interaction.prompt.name !== 'login') {
            sendError(res, 404, 'interaction_invalid');
            return;
        }

        const dashboardLogin = await validateDashboardLogin(req, res);
        if (!dashboardLogin) return;
        if (interaction.result?.login) {
            if (interaction.result.login.accountId !== String(dashboardLogin.user.id)) {
                sendError(res, 409, 'interaction_completed');
                return;
            }
            res.status(200).send({ data: { resumeUrl: interaction.returnTo } });
            return;
        }

        const resumeUrl = await requireOAuthServer().interactionResult(
            req,
            res,
            { login: { accountId: String(dashboardLogin.user.id), amr: ['dashboard_session'], ts: dashboardLogin.authenticatedAt } },
            { mergeWithLastSubmission: false }
        );
        res.status(200).send({ data: { resumeUrl } });
    } catch (err) {
        handleInteractionError(err, res, next);
    }
};

function dashboardAuthenticationTime(user: Express.User): number | null {
    const authenticatedAt = user.authenticated_at;
    return typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt) && authenticatedAt > 0 && authenticatedAt <= Date.now() / 1000
        ? authenticatedAt
        : null;
}

async function revalidateDashboardIdentity(
    sessionUser: Express.User
): Promise<{ user: DBUser; account: DBTeam } | { error: 'user_suspended' | 'account_unavailable' }> {
    const user = await db.knex<DBUser>('_nango_users').where({ id: sessionUser.id, account_id: sessionUser.account_id, suspended: false }).first();
    if (!user) return { error: 'user_suspended' };
    const account = await db.knex<DBTeam>('_nango_accounts').where({ id: user.account_id }).first();
    if (!account) return { error: 'account_unavailable' };
    return { user, account };
}

async function validateDashboardLogin(req: Request, res: Response): Promise<{ user: DBUser; authenticatedAt: number } | null> {
    if (!req.user) {
        sendError(res, 401, 'login_required');
        return null;
    }
    const authenticatedAt = dashboardAuthenticationTime(req.user);
    if (!authenticatedAt) {
        sendError(res, 401, 'login_required');
        return null;
    }
    const identity = await revalidateDashboardIdentity(req.user);
    if ('error' in identity) {
        sendError(res, 403, identity.error);
        return null;
    }
    return { user: identity.user, authenticatedAt };
}

export const approveOAuthConsent: RequestHandler = async (req, res, next) => {
    await decideConsent('approved', req, res, next);
};

export const denyOAuthConsent: RequestHandler = async (req, res, next) => {
    await decideConsent('denied', req, res, next);
};

async function decideConsent(decision: 'approved' | 'denied', req: Request, res: Response, next: NextFunction): Promise<void> {
    let uid: string | undefined;
    let providerGrantId: string | undefined;
    let previousGrant: AdapterPayload | undefined;
    let interactionClaimed = false;
    let resultPersisted = false;
    try {
        uid = parseUid(req, res);
        if (!uid || !requireExpectedOrigin(req, res)) return;
        const emptyBody = requireEmptyBody(req);
        if (emptyBody) {
            res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
            return;
        }
        const interaction = await readProviderInteraction(req, res, uid);
        if (!interaction) return;
        if (!interaction.session) {
            sendError(res, 403, 'interaction_invalid');
            return;
        }
        const dashboardLogin = await validateDashboardLogin(req, res);
        if (!dashboardLogin || !requireMatchingDashboardUser(interaction, dashboardLogin.user, res)) return;

        const context = await validateInteraction(interaction);
        if ('error' in context) {
            sendError(res, context.status, context.error);
            return;
        }
        const config = requireOAuthConfig();
        interactionClaimed = await claimOAuthInteraction({
            knex: db.knex,
            encryptionKey: config.config.encryptionKey,
            interactionId: uid
        });
        if (!interactionClaimed) {
            sendError(res, 409, 'interaction_completed');
            return;
        }

        const server = requireOAuthServer();
        if (decision === 'denied') {
            const resumeUrl = await server.interactionResult(
                req,
                res,
                { error: 'access_denied', error_description: 'The authorization request was denied' },
                { mergeWithLastSubmission: false }
            );
            resultPersisted = true;
            res.status(200).send({ data: { resumeUrl } });
            return;
        }

        const newGrantProperties = {
            accountId: String(context.user.id),
            clientId: context.clientId,
            jti: randomBytes(32).toString('base64url'),
            iat: context.authenticatedAt
        };
        if (interaction.grantId) {
            const persistedGrant = await server.Grant.adapter.find(interaction.grantId);
            if (persistedGrant) previousGrant = persistedGrant;
        }
        if (interaction.grantId && !previousGrant) {
            // The grant was revoked while this consent page was open. Keep the interaction
            // claimed so it cannot be retried against stale state; the client must start again.
            sendError(res, 404, 'interaction_invalid');
            return;
        }
        // Grant methods mutate nested scope objects, so keep an untouched snapshot for compensation.
        const grant = previousGrant ? new server.Grant(structuredClone(previousGrant)) : new server.Grant(newGrantProperties);
        const reservedGrantId = grant.jti;
        if (!reservedGrantId) throw new Error('OAuth provider grant identifier could not be reserved');
        grant.addOIDCScope(context.resource.scopes);
        grant.addResourceScope(context.resource.resource, context.resource.scopes);

        const savedProviderGrantId = await grant.save();
        if (savedProviderGrantId !== reservedGrantId) throw new Error('OAuth provider changed its reserved grant identifier');
        providerGrantId = savedProviderGrantId;
        const resumeUrl = await server.interactionResult(req, res, { consent: { grantId: providerGrantId } });
        resultPersisted = true;
        res.status(200).send({ data: { resumeUrl } });
    } catch (err) {
        let grantCompensated = true;
        if (providerGrantId && !resultPersisted) {
            try {
                if (previousGrant) {
                    await requireOAuthServer().Grant.adapter.upsert(providerGrantId, previousGrant);
                } else {
                    await revokeOAuthGrant({
                        knex: db.knex,
                        encryptionKey: requireOAuthConfig().config.encryptionKey,
                        grantId: providerGrantId
                    });
                }
            } catch (err) {
                grantCompensated = false;
                logger.error('Failed to compensate OAuth grant after consent submission failed', {
                    error: err,
                    interactionId: uid,
                    operation: previousGrant ? 'restore_existing_grant' : 'revoke_new_grant'
                });
            }
        }
        if (uid && interactionClaimed && !resultPersisted && grantCompensated) {
            try {
                await releaseOAuthInteraction({
                    knex: db.knex,
                    encryptionKey: requireOAuthConfig().config.encryptionKey,
                    interactionId: uid
                });
            } catch (err) {
                // The interaction remains claimed, which fails closed. Still return the original
                // protocol error so a cleanup outage does not turn a useful 410 into a generic 500.
                logger.error('Failed to release OAuth interaction after consent submission failed', {
                    error: err,
                    interactionId: uid
                });
            }
        }
        handleInteractionError(err, res, next);
    }
}

function requireMatchingDashboardUser(interaction: Interaction, dashboardUser: DBUser, res: Response): boolean {
    if (interaction.session?.accountId !== String(dashboardUser.id)) {
        sendError(res, 403, 'interaction_invalid');
        return false;
    }
    return true;
}

async function validateInteraction(interaction: Interaction): Promise<
    | {
          user: DBUser;
          account: DBTeam;
          clientId: string;
          client: OAuthConsentInteraction['client'];
          redirectUri: string;
          resource: ValidatedOAuthResource;
          authenticatedAt: number;
      }
    | { status: 403 | 404 | 409 | 410; error: OAuthConsentErrorCode }
> {
    if (interaction.exp * 1000 <= Date.now()) return { status: 410, error: 'interaction_expired' };
    if (interaction.result) return { status: 409, error: 'interaction_completed' };
    if (interaction.prompt.name !== 'consent' || !interaction.session) return { status: 404, error: 'interaction_invalid' };

    const userId = Number(interaction.session.accountId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return { status: 404, error: 'interaction_invalid' };
    const user = await db.knex<DBUser>('_nango_users').where({ id: userId }).first();
    if (!user || user.suspended) return { status: 403, error: 'user_suspended' };
    const account = await db.knex<DBTeam>('_nango_accounts').where({ id: user.account_id }).first();
    if (!account) return { status: 403, error: 'account_unavailable' };

    const sessionCookie = interaction.session.cookie;
    if (!sessionCookie) return { status: 404, error: 'interaction_invalid' };
    const providerSession = await requireOAuthServer().Session.find(sessionCookie);
    if (
        !providerSession ||
        providerSession.accountId !== String(user.id) ||
        typeof providerSession.loginTs !== 'number' ||
        !Number.isFinite(providerSession.loginTs) ||
        providerSession.loginTs <= 0
    ) {
        return { status: 404, error: 'interaction_invalid' };
    }

    const clientId = readStringParam(interaction, 'client_id');
    const redirectUri = readStringParam(interaction, 'redirect_uri');
    if (!clientId || !redirectUri) return { status: 404, error: 'interaction_invalid' };
    const client = await requireOAuthServer().Client.find(clientId);
    if (!client || !client.redirectUriAllowed(redirectUri)) return { status: 404, error: 'interaction_invalid' };

    const resource = validateRequestedResource(interaction);
    if (!resource) return { status: 404, error: 'interaction_invalid' };
    return {
        user,
        account,
        clientId,
        client: displayClient(client, clientId),
        redirectUri,
        resource,
        authenticatedAt: providerSession.loginTs
    };
}

function validateRequestedResource(interaction: Interaction): ValidatedOAuthResource | null {
    const config = requireOAuthConfig();
    const resourceParam = interaction.params['resource'];
    if (resourceParam !== config.resource.resource) return null;
    const requestedScopes = readStringParam(interaction, 'scope')?.split(' ').filter(Boolean) ?? [];
    const allowedScopes = new Set(config.resource.scopes);
    if (requestedScopes.length === 0 || requestedScopes.some((scope) => !allowedScopes.has(scope))) return null;
    return { resource: config.resource.resource, hostname: new URL(config.resource.resource).hostname, scopes: requestedScopes };
}

function displayClient(client: Client, clientId: string): OAuthConsentInteraction['client'] {
    const hostname = new URL(clientId).hostname;
    return {
        name: boundedText(client.clientName, 120, hostname),
        hostname
    };
}

function boundedText(value: string | null | undefined, max: number, fallback: string): string {
    const normalized = value
        ?.split('')
        .filter((character) => character.charCodeAt(0) > 0x1f && character.charCodeAt(0) !== 0x7f)
        .join('')
        .trim();
    return (normalized || fallback).slice(0, max);
}

async function readProviderInteraction(
    req: Request,
    res: Response,
    uid: string,
    { allowSubmittedLogin = false }: { allowSubmittedLogin?: boolean } = {}
): Promise<Interaction | null> {
    const interaction = await requireOAuthServer().interactionDetails(req, res);
    if (interaction.uid !== uid) {
        sendError(res, 404, 'interaction_invalid');
        return null;
    }
    if (interaction.exp * 1000 <= Date.now()) {
        sendError(res, 410, 'interaction_expired');
        return null;
    }
    const submittedLogin = interaction.prompt.name === 'login' && interaction.result?.login && !interaction.result['error'];
    if (interaction.result && !(allowSubmittedLogin && submittedLogin)) {
        sendError(res, 409, 'interaction_completed');
        return null;
    }
    return interaction;
}

function readStringParam(interaction: Interaction, name: string): string | undefined {
    const value = interaction.params[name];
    return typeof value === 'string' ? value : undefined;
}

function parseUid(req: Request, res: Response): string | undefined {
    const parsed = routeParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        sendError(res, 404, 'interaction_invalid');
        return undefined;
    }
    return parsed.data.uid;
}

function requireExpectedOrigin(req: Request, res: Response): boolean {
    if (req.get('origin') !== DASHBOARD_ORIGIN) {
        sendError(res, 403, 'invalid_origin');
        return false;
    }
    return true;
}

function requireOAuthServer() {
    if (!oauthServer) throw new Error('OAuth server is disabled');
    return oauthServer;
}

function requireOAuthConfig() {
    if (!oauthServerConfig) throw new Error('OAuth server is disabled');
    return oauthServerConfig;
}

function sendError(res: Response, status: number, code: OAuthConsentErrorCode): void {
    res.status(status).send({ error: { code, message: publicErrorMessage(code) } });
}

function publicErrorMessage(code: OAuthConsentErrorCode): string {
    switch (code) {
        case 'interaction_expired':
            return 'This authorization request has expired';
        case 'interaction_completed':
            return 'This authorization request was already completed';
        case 'login_required':
            return 'Sign in to continue';
        case 'user_suspended':
        case 'account_unavailable':
            return 'Your Nango account is not available';
        case 'invalid_origin':
        case 'interaction_invalid':
            return 'This authorization request is invalid';
    }
}

function handleInteractionError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof errors.SessionNotFound) {
        sendError(res, 410, 'interaction_expired');
        return;
    }
    next(err);
}
