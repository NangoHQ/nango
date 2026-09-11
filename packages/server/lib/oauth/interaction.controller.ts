import { randomBytes } from 'node:crypto';

import { errors } from 'oidc-provider';
import { z } from 'zod';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { oauthConsentDecisionSchema } from '@nangohq/oauth-server/contracts';
import { basePublicUrl } from '@nangohq/utils';

import { claimConsentDecision, completeConsentDecision, establishConsentInteraction, releaseConsentDecision } from './interaction-state.service.js';
import { activateProductGrant, compensateProductGrant, createPendingProductGrant } from './product-grant.service.js';
import { oauthServer, oauthServerConfig } from './server.js';

import type { DBTeam, DBUser, OAuthConsentErrorCode, OAuthConsentInteraction, OAuthConsentResource } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Client, Interaction } from 'oidc-provider';

const routeParamsSchema = z.object({ uid: z.string().min(1).max(128) }).strict();
const DASHBOARD_ORIGIN = new URL(basePublicUrl).origin;

export const oauthConsentCors: RequestHandler = (req, res, next) => {
    const origin = req.get('origin');
    if (origin === DASHBOARD_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', DASHBOARD_ORIGIN);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

        if (!interaction.session) {
            if (req.user) {
                const identity = await revalidateDashboardIdentity(req.user);
                if ('error' in identity) {
                    sendError(res, 403, identity.error);
                    return;
                }
                if (!(await getFlags().isOAuthServerConsentEnabled(identity.account.uuid))) {
                    sendError(res, 403, 'consent_disabled');
                    return;
                }
                if (interaction.prompt.name !== 'login') {
                    sendError(res, 404, 'interaction_invalid');
                    return;
                }

                if (interaction.result?.login) {
                    if (interaction.result.login.accountId !== String(identity.user.id)) {
                        sendError(res, 409, 'interaction_completed');
                        return;
                    }
                    res.status(202).send({ data: { resumeUrl: interaction.returnTo } });
                    return;
                }

                const resumeUrl = await requireOAuthServer().interactionResult(
                    req,
                    res,
                    { login: { accountId: String(identity.user.id), amr: ['dashboard_session'] } },
                    { mergeWithLastSubmission: false }
                );
                res.status(202).send({ data: { resumeUrl } });
                return;
            }

            res.status(401).send({ error: { code: 'login_required', message: 'Sign in to continue' } });
            return;
        }

        const context = await validateInteraction(interaction);
        if ('error' in context) {
            sendError(res, context.status, context.error);
            return;
        }
        if (!(await getFlags().isOAuthServerConsentEnabled(context.account.uuid))) {
            sendError(res, 403, 'consent_disabled');
            return;
        }

        const csrfToken = await establishConsentInteraction({
            uid,
            userId: context.user.id,
            accountId: context.account.id,
            expiresAt: new Date(interaction.exp * 1000)
        });
        if (!csrfToken) {
            sendError(res, 409, 'interaction_completed');
            return;
        }

        res.status(200).send({
            data: {
                interactionId: uid,
                expiresAt: new Date(interaction.exp * 1000).toISOString(),
                csrfToken,
                client: context.client,
                callbackHostname: context.callbackHostname,
                account: { name: boundedText(context.account.name, 120, 'Nango account') },
                resources: context.resources
            } satisfies OAuthConsentInteraction
        });
    } catch (err) {
        handleInteractionError(err, res, next);
    }
};

async function revalidateDashboardIdentity(
    sessionUser: Express.User
): Promise<{ user: DBUser; account: DBTeam } | { error: 'user_suspended' | 'account_unavailable' }> {
    const user = await db.knex<DBUser>('_nango_users').where({ id: sessionUser.id, account_id: sessionUser.account_id, suspended: false }).first();
    if (!user) return { error: 'user_suspended' };
    const account = await db.knex<DBTeam>('_nango_accounts').where({ id: user.account_id }).first();
    if (!account) return { error: 'account_unavailable' };
    return { user, account };
}

export const approveOAuthConsent: RequestHandler = async (req, res, next) => {
    await decideConsent('approved', req, res, next);
};

export const denyOAuthConsent: RequestHandler = async (req, res, next) => {
    await decideConsent('denied', req, res, next);
};

async function decideConsent(decision: 'approved' | 'denied', req: Request, res: Response, next: NextFunction): Promise<void> {
    let uid: string | undefined;
    let productGrant: { id: string; providerGrantId: string; encryptionKey: string } | undefined;
    try {
        uid = parseUid(req, res);
        if (!uid || !requireExpectedOrigin(req, res)) return;
        const body = oauthConsentDecisionSchema.safeParse(req.body);
        if (!body.success) {
            sendError(res, 400, 'invalid_csrf');
            return;
        }
        const interaction = await readProviderInteraction(req, res, uid);
        if (!interaction) return;
        if (!interaction.session) {
            sendError(res, 403, 'interaction_invalid');
            return;
        }

        const context = await validateInteraction(interaction);
        if ('error' in context) {
            sendError(res, context.status, context.error);
            return;
        }
        req.audit = {
            ...req.audit,
            oauthConsent: {
                userId: context.user.id,
                userEmail: context.user.email,
                accountId: context.account.id,
                clientHostname: context.client.hostname,
                resourceHostnames: context.resources.map((resource) => resource.hostname),
                scopes: [...new Set(context.resources.flatMap((resource) => resource.scopes))]
            }
        };
        if (!(await getFlags().isOAuthServerConsentEnabled(context.account.uuid))) {
            sendError(res, 403, 'consent_disabled');
            return;
        }
        const claim = await claimConsentDecision({
            uid,
            csrfToken: body.data.csrfToken,
            userId: context.user.id,
            accountId: context.account.id
        });
        if (claim !== 'claimed') {
            sendError(
                res,
                claim === 'expired' ? 410 : claim === 'completed' ? 409 : 403,
                claim === 'expired' ? 'interaction_expired' : claim === 'completed' ? 'interaction_completed' : 'invalid_csrf'
            );
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
            await completeConsentDecision(uid, 'denied');
            res.status(200).send({ data: { resumeUrl } });
            return;
        }

        const newGrantProperties = {
            accountId: String(context.user.id),
            clientId: context.clientId,
            jti: randomBytes(32).toString('base64url')
        };
        const grant = interaction.grantId ? await server.Grant.find(interaction.grantId) : new server.Grant(newGrantProperties);
        if (!grant) throw new Error('Existing OAuth grant could not be loaded');
        const providerGrantId = grant.jti;
        if (!providerGrantId) throw new Error('OAuth provider grant identifier could not be reserved');
        grant.addOIDCScope([...new Set(context.resources.flatMap((resource) => resource.scopes))]);
        for (const resource of context.resources) grant.addResourceScope(resource.resource, resource.scopes);

        const config = requireOAuthConfig();
        productGrant = {
            id: (
                await createPendingProductGrant({
                    grantId: providerGrantId,
                    clientId: context.clientId,
                    encryptionKey: config.config.encryptionKey,
                    userId: context.user.id,
                    accountId: context.account.id,
                    resources: context.resources
                })
            ).id,
            providerGrantId,
            encryptionKey: config.config.encryptionKey
        };
        if (req.audit.oauthConsent) req.audit.oauthConsent.productGrantId = productGrant.id;

        const savedProviderGrantId = await grant.save();
        if (savedProviderGrantId !== productGrant.providerGrantId) throw new Error('OAuth provider changed its reserved grant identifier');
        await activateProductGrant(productGrant.id, context.resources);
        const resumeUrl = await server.interactionResult(req, res, { consent: { grantId: providerGrantId } });
        await completeConsentDecision(uid, 'approved');
        res.status(200).send({ data: { resumeUrl } });
    } catch (err) {
        if (productGrant) {
            try {
                await compensateProductGrant(productGrant.id, productGrant.providerGrantId, productGrant.encryptionKey, 'approval_failed');
            } catch (err) {
                next(err);
                return;
            }
        }
        if (uid) await releaseConsentDecision(uid);
        handleInteractionError(err, res, next);
    }
}

async function validateInteraction(interaction: Interaction): Promise<
    | {
          user: DBUser;
          account: DBTeam;
          clientId: string;
          client: OAuthConsentInteraction['client'];
          callbackHostname: string;
          resources: OAuthConsentResource[];
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

    const clientId = readStringParam(interaction, 'client_id');
    const redirectUri = readStringParam(interaction, 'redirect_uri');
    if (!clientId || !redirectUri) return { status: 404, error: 'interaction_invalid' };
    const client = await requireOAuthServer().Client.find(clientId);
    if (!client || !client.redirectUriAllowed(redirectUri)) return { status: 404, error: 'interaction_invalid' };

    const resources = validateRequestedResources(interaction);
    if (!resources) return { status: 404, error: 'interaction_invalid' };
    return {
        user,
        account,
        clientId,
        client: displayClient(client, clientId),
        callbackHostname: new URL(redirectUri).hostname,
        resources
    };
}

function validateRequestedResources(interaction: Interaction): OAuthConsentResource[] | null {
    const config = requireOAuthConfig();
    const resourceParam = interaction.params['resource'];
    const requested = Array.isArray(resourceParam) ? resourceParam : typeof resourceParam === 'string' ? [resourceParam] : [];
    if (requested.length === 0 || requested.length > 16 || new Set(requested).size !== requested.length || requested.some((item) => typeof item !== 'string')) {
        return null;
    }
    const requestedScopes = readStringParam(interaction, 'scope')?.split(' ').filter(Boolean) ?? [];
    if (requestedScopes.length === 0 || requestedScopes.length > 64) return null;

    const resources: OAuthConsentResource[] = [];
    const grantedScopeUnion = new Set<string>();
    for (const resource of requested as string[]) {
        const configured = config.resources.find((candidate) => candidate.resource === resource);
        if (!configured) return null;
        const allowed = new Set(configured.scopes);
        const scopes = requestedScopes.filter((scope) => allowed.has(scope));
        if (scopes.length === 0) return null;
        scopes.forEach((scope) => grantedScopeUnion.add(scope));
        resources.push({ resource, hostname: new URL(resource).hostname, scopes });
    }
    if (requestedScopes.some((scope) => !grantedScopeUnion.has(scope))) return null;
    return resources;
}

function displayClient(client: Client, clientId: string): OAuthConsentInteraction['client'] {
    const hostname = new URL(clientId).hostname;
    return {
        name: boundedText(client.clientName, 120, hostname),
        hostname,
        verified: false
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
        case 'consent_disabled':
            return 'OAuth consent is not available';
        case 'interaction_expired':
            return 'This authorization request has expired';
        case 'interaction_completed':
            return 'This authorization request was already completed';
        case 'login_required':
            return 'Sign in to continue';
        case 'user_suspended':
        case 'account_unavailable':
            return 'Your Nango account is not available';
        case 'invalid_csrf':
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
