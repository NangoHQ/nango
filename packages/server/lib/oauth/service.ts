import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import tracer from 'dd-trace';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { allowPublicCimdClient, hashOAuthGrantId, isValidCimdClientId, withOAuthTransaction } from '@nangohq/oauth-server';
import { accountService, getPlanSafe } from '@nangohq/shared';
import { basePublicUrl, metrics, stringTimingSafeEqual, tagTraceUser } from '@nangohq/utils';

import { loadSessionIdentity } from '../utils/sessionIdentity.js';
import { GRANT_RESOURCES, PRODUCT_GRANTS } from './grants.js';
import { interactionResponse, OAuthConsentError } from './validation.js';

import type { RequestLocals } from '../utils/express.js';
import type { NangoOAuthServerConfig } from './config.js';
import type { ProductGrant } from './grants.js';
import type { OAuthProvider } from '@nangohq/oauth-server';
import type { DBUser, OAuthConsentResource } from '@nangohq/types';
import type { Request, Response } from 'express';

const DECISIONS = 'oauth_consent_decisions';

interface LoginSession {
    user_id: number;
    account_id: number;
}

export function opaqueSecret(): string {
    return randomBytes(32).toString('base64url');
}
export function hashSecret(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}
export function oauthContinuation(uid: string): string {
    return `/oauth/continue/${encodeURIComponent(uid)}`;
}

export class OAuthConsentService {
    readonly issuer: string;
    readonly dashboardOrigin: string;
    constructor(
        readonly provider: OAuthProvider,
        readonly options: NangoOAuthServerConfig,
        dashboardOrigin = basePublicUrl
    ) {
        this.issuer = options.config.baseUrl;
        this.dashboardOrigin = new URL(dashboardOrigin).origin;
    }

    async enabled(accountUuid?: string): Promise<void> {
        if (!(await getFlags().isOAuthConsentEnabled(accountUuid))) throw new OAuthConsentError(403, 'feature_disabled');
    }

    expectedOrigin(req: Request): void {
        if (req.get('origin') !== this.dashboardOrigin) throw new OAuthConsentError(403, 'forbidden');
    }

    async session(req: Request, res: Response<any, RequestLocals>): Promise<LoginSession> {
        const start = Date.now();
        try {
            return await tracer.trace('sessionAuth', async () => {
                if (req.session.impersonatedBy) throw new OAuthConsentError(403, 'forbidden');
                if (!req.isAuthenticated() || !req.user || req.session.pendingMfaLogin) throw new OAuthConsentError(401, 'unauthorized');
                const identity = await loadSessionIdentity(req.user.id, req.user.account_id);
                if (!identity || !identity.user.email_verified) throw new OAuthConsentError(401, 'unauthorized');
                Object.assign(res.locals, identity, { authType: 'session', plan: await getPlanSafe(db.knex, { accountId: identity.account.id }) });
                tagTraceUser(res.locals);
                return { user_id: identity.user.id, account_id: identity.account.id };
            });
        } finally {
            metrics.duration(metrics.Types.AUTH_SESSION, Date.now() - start);
        }
    }

    async interaction(req: Request, res: Response<any, RequestLocals>, uid: string) {
        if (
            res.locals.user &&
            (await db
                .knex(DECISIONS)
                .where({ interaction_hash: hashSecret(uid), user_id: res.locals.user.id })
                .first('user_id'))
        )
            throw new OAuthConsentError(409, 'interaction_completed');
        const interaction = await this.provider.interactionDetails(req, res);
        if (interaction.uid !== uid) throw new OAuthConsentError(400, 'invalid_interaction');
        if (interaction.exp * 1000 <= Date.now()) throw new OAuthConsentError(410, 'interaction_expired');
        if (interaction.result) throw new OAuthConsentError(409, 'interaction_completed');
        return interaction;
    }

    async enter(req: Request, res: Response<any, RequestLocals>, uid: string): Promise<void> {
        const interaction = await this.interaction(req, res, uid);
        const continuation = oauthContinuation(uid);
        const next = encodeURIComponent(continuation);
        if (req.session.impersonatedBy) throw new OAuthConsentError(403, 'forbidden');
        if (!req.isAuthenticated() || req.session.pendingMfaLogin) {
            // Persist only on a pre-login session. Never save an authenticated session here:
            // an in-flight save could resurrect a session revoked by a password reset.
            req.session.oauthContinuation = continuation;
            await saveDashboardSession(req);
            res.redirect(303, `${this.dashboardOrigin}/signin?next=${next}`);
            return;
        }
        const session = await this.session(req, res);
        await this.enabled(res.locals.account.uuid);
        const onboarding = res.locals.user.account_discovery_pending
            ? 'account-discovery'
            : (await accountService.shouldShowHearAboutUs(res.locals.account))
              ? 'hear-about-us'
              : null;
        if (onboarding) {
            res.redirect(303, `${this.dashboardOrigin}/onboarding/${onboarding}?next=${next}`);
            return;
        }
        const subject = this.subject(session);
        if (interaction.session?.accountId && interaction.session.accountId !== subject) throw new OAuthConsentError(400, 'invalid_interaction');
        if (interaction.prompt.name === 'login') {
            await this.provider.interactionFinished(
                req,
                res,
                { login: { accountId: subject, remember: false, amr: ['nango_session'] } },
                { mergeWithLastSubmission: false }
            );
            return;
        }
        res.redirect(303, `${this.dashboardOrigin}/oauth/consent/${encodeURIComponent(uid)}`);
    }

    private subject(session: Pick<LoginSession, 'user_id' | 'account_id'>): string {
        return `${session.user_id}:${session.account_id}`;
    }
    private csrf(req: Request, uid: string, session: LoginSession): string {
        return createHmac('sha256', this.options.config.cookieKeys[0]!)
            .update(JSON.stringify([uid, session.user_id, session.account_id, req.sessionID]))
            .digest('base64url');
    }

    private async validateRequest(req: Request, res: Response<any, RequestLocals>, uid: string, session: LoginSession) {
        const interaction = await this.interaction(req, res, uid);
        if (interaction.prompt.name !== 'consent' || interaction.session?.accountId !== this.subject(session))
            throw new OAuthConsentError(400, 'invalid_interaction');
        const clientId = interaction.params['client_id'];
        const callback = interaction.params['redirect_uri'];
        if (typeof clientId !== 'string' || !isValidCimdClientId(clientId) || typeof callback !== 'string')
            throw new OAuthConsentError(400, 'invalid_interaction');
        const client = await this.provider.Client.find(clientId);
        const allowedScopes = new Set(this.options.resources.flatMap((r) => [...r.scopes]));
        if (!client || !allowPublicCimdClient(client, allowedScopes) || !client.redirectUris?.includes(callback))
            throw new OAuthConsentError(400, 'invalid_interaction');
        const scope = interaction.params['scope'];
        if (typeof scope !== 'string') throw new OAuthConsentError(400, 'invalid_interaction');
        const scopes = [...new Set(scope.split(' ').filter(Boolean))];
        if (!scopes.length || scopes.some((s) => !allowedScopes.has(s) || (client.scope && !client.scope.split(' ').includes(s))))
            throw new OAuthConsentError(400, 'invalid_interaction');
        const raw = interaction.params['resource'];
        const requested = typeof raw === 'string' ? [raw] : raw;
        if (!Array.isArray(requested) || !requested.length || requested.length > 20 || requested.some((r) => typeof r !== 'string'))
            throw new OAuthConsentError(400, 'invalid_interaction');
        const resources: OAuthConsentResource[] = [...new Set(requested as string[])].map((resource) => {
            const configured = this.options.resources.find((r) => r.resource === resource);
            const resourceScopes = configured ? scopes.filter((s) => configured.scopes.includes(s)) : [];
            if (!configured || !resourceScopes.length) throw new OAuthConsentError(400, 'invalid_interaction');
            return { resource, scopes: resourceScopes };
        });
        if (scopes.some((s) => !resources.some((r) => r.scopes.includes(s)))) throw new OAuthConsentError(400, 'invalid_interaction');
        return { interaction, client, clientId, callback, resources, scopes };
    }

    async read(req: Request, res: Response<any, RequestLocals>, uid: string) {
        const session = await this.session(req, res);
        await this.enabled(res.locals.account.uuid);
        const { interaction, client, clientId, callback, resources } = await this.validateRequest(req, res, uid, session);
        return interactionResponse.parse({
            clientName: (client.clientName ?? new URL(clientId).hostname).slice(0, 120),
            clientHostname: new URL(clientId).hostname,
            callbackHostname: new URL(callback).hostname,
            accountName: String(res.locals.account.name).slice(0, 120),
            resources,
            expiresAt: new Date(interaction.exp * 1000).toISOString(),
            csrfToken: this.csrf(req, uid, session)
        });
    }

    async decide(
        req: Request,
        res: Response<any, RequestLocals>,
        uid: string,
        csrfToken: string,
        approve: true
    ): Promise<{ redirectUrl: string; grantId: string }>;
    async decide(req: Request, res: Response<any, RequestLocals>, uid: string, csrfToken: string, approve: false): Promise<{ redirectUrl: string }>;
    async decide(
        req: Request,
        res: Response<any, RequestLocals>,
        uid: string,
        csrfToken: string,
        approve: boolean
    ): Promise<{ redirectUrl: string; grantId?: string }> {
        this.expectedOrigin(req);
        const session = await this.session(req, res);
        if (!stringTimingSafeEqual(csrfToken, this.csrf(req, uid, session))) throw new OAuthConsentError(403, 'forbidden');
        return await db.knex.transaction((trx) =>
            withOAuthTransaction(trx, async () => {
                await trx<DBUser>('_nango_users').where({ id: session.user_id }).forUpdate().first();
                const identity = await loadSessionIdentity(session.user_id, session.account_id, trx);
                if (!identity || !identity.user.email_verified) throw new OAuthConsentError(401, 'unauthorized');
                if (!(await trx('_nango_sessions').where({ sid: req.sessionID }).where('expired', '>', new Date()).first()))
                    throw new OAuthConsentError(401, 'unauthorized');
                const { interaction, clientId, resources, scopes } = await this.validateRequest(req, res, uid, session);
                const claimed = await trx(DECISIONS)
                    .insert({ interaction_hash: hashSecret(uid), user_id: session.user_id, expires_at: new Date(interaction.exp * 1000) })
                    .onConflict('interaction_hash')
                    .ignore()
                    .returning('user_id');
                if (!claimed.length) throw new OAuthConsentError(409, 'interaction_completed');
                await this.enabled(identity.account.uuid);
                if (!approve)
                    return {
                        redirectUrl: await this.provider.interactionResult(
                            req,
                            res,
                            { error: 'access_denied', error_description: 'The user denied access.' },
                            { mergeWithLastSubmission: false }
                        )
                    };
                // Always create a fresh provider grant: a new consent never silently expands an older product binding.
                const grant = new this.provider.Grant({ accountId: this.subject(session), clientId });
                grant.jti = opaqueSecret();
                // oidc-provider also tracks authorization-level OAuth scopes in its OIDC scope
                // slot, even though this server never offers OpenID Connect or ID tokens.
                grant.addOIDCScope(scopes.join(' '));
                const productId = randomUUID();
                await trx<ProductGrant>(PRODUCT_GRANTS).insert({
                    id: productId,
                    provider_grant_hash: hashOAuthGrantId(this.options.config.encryptionKey, grant.jti),
                    user_id: session.user_id,
                    account_id: session.account_id,
                    client_id: clientId,
                    status: 'pending'
                });
                for (const resource of resources) {
                    grant.addResourceScope(resource.resource, resource.scopes.join(' '));
                    await trx(GRANT_RESOURCES).insert({ grant_id: productId, resource: resource.resource, scopes: resource.scopes });
                }
                const grantId = await grant.save();
                const redirectUrl = await this.provider.interactionResult(req, res, { consent: { grantId } });
                await trx(PRODUCT_GRANTS).where({ id: productId, status: 'pending' }).update({ status: 'active', updated_at: new Date() });
                return { redirectUrl, grantId: productId };
            })
        );
    }
}

async function saveDashboardSession(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}
