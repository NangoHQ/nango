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

const HANDOFFS = 'oauth_login_handoffs';
const SESSIONS = 'oauth_login_sessions';
const DECISIONS = 'oauth_consent_decisions';
export const LOGIN_COOKIE = 'nango_oauth_login';
const BROWSER_COOKIE = 'nango_oauth_bridge';
const HANDOFF_TTL_MS = 45_000;
const LOGIN_TTL_MS = 7 * 24 * 60 * 60_000;

interface LoginSession {
    token_hash: Buffer;
    user_id: number;
    account_id: number;
    expires_at: Date;
}
interface Handoff {
    user_id: number | null;
    account_id: number | null;
    expires_at: Date;
    state_hash: Buffer;
    browser_hash: Buffer;
    interaction_uid: string;
    issuer: string;
    return_to: string;
    code_hash: Buffer | null;
    code_expires_at: Date | null;
    consumed_at: Date | null;
}

export function opaqueSecret(): string {
    return randomBytes(32).toString('base64url');
}
export function hashSecret(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}
export function oauthContinuation(state: string): string {
    return `/oauth/continue?state=${encodeURIComponent(state)}`;
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

    private cookieOptions(maxAge: number) {
        return { httpOnly: true, secure: this.issuer.startsWith('https:'), sameSite: 'lax' as const, path: '/oauth', maxAge };
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
                const token: unknown = req.cookies?.[LOGIN_COOKIE];
                if (typeof token !== 'string') throw new OAuthConsentError(401, 'unauthorized');
                const session = await db
                    .knex<LoginSession>(SESSIONS)
                    .where({ token_hash: hashSecret(token) })
                    .where('expires_at', '>', new Date())
                    .first();
                if (!session) throw new OAuthConsentError(401, 'unauthorized');
                const identity = await loadSessionIdentity(session.user_id, session.account_id);
                if (!identity) throw new OAuthConsentError(401, 'unauthorized');
                Object.assign(res.locals, identity, { authType: 'session', plan: await getPlanSafe(db.knex, { accountId: identity.account.id }) });
                tagTraceUser(res.locals);
                return session;
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
        let session: LoginSession | undefined;
        try {
            session = await this.session(req, res);
        } catch (err) {
            if (!(err instanceof OAuthConsentError)) throw err;
        }
        if (!session) {
            const state = opaqueSecret();
            const browser = opaqueSecret();
            await db.knex(HANDOFFS).insert({
                state_hash: hashSecret(state),
                browser_hash: hashSecret(browser),
                interaction_uid: uid,
                issuer: this.issuer,
                return_to: `${this.issuer}/oauth/interaction/${uid}`,
                expires_at: new Date(interaction.exp * 1000)
            });
            res.cookie(BROWSER_COOKIE, browser, this.cookieOptions(Math.max(0, interaction.exp * 1000 - Date.now())));
            res.redirect(303, `${this.dashboardOrigin}${oauthContinuation(state)}`);
            return;
        }
        await this.enabled(res.locals.account.uuid);
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

    async issueHandoff(req: Request, res: Response<any, RequestLocals>, state: string): Promise<string> {
        this.expectedOrigin(req);
        const handoff = await db
            .knex<Handoff>(HANDOFFS)
            .where({ state_hash: hashSecret(state), consumed_at: null, issuer: this.issuer })
            .where('expires_at', '>', new Date())
            .first();
        if (!handoff || handoff.return_to !== `${this.issuer}/oauth/interaction/${handoff.interaction_uid}`)
            throw new OAuthConsentError(400, 'invalid_handoff');
        if (req.session.impersonatedBy) throw new OAuthConsentError(403, 'forbidden');
        if (!req.isAuthenticated() || !req.user || req.session.pendingMfaLogin) {
            req.session.oauthContinuation = oauthContinuation(state);
            await saveDashboardSession(req);
            throw new OAuthConsentError(401, 'unauthorized');
        }
        const principal = req.user;
        return await db.knex.transaction(async (trx) => {
            // Lock order matches password revocation and consumption: user, then handoff.
            // Never save an authenticated dashboard session before this check: saving a
            // stale in-flight request could resurrect a session deleted by a password reset.
            await trx('_nango_users').where({ id: principal.id }).forUpdate().first('id');
            const identity = await loadSessionIdentity(principal.id, principal.account_id, trx);
            if (!identity || !identity.user.email_verified || !(await trx('_nango_sessions').where({ sid: req.sessionID }).first('sid')))
                throw new OAuthConsentError(401, 'unauthorized');
            const { user, account } = identity;
            const current = await trx<Handoff>(HANDOFFS).where({ state_hash: handoff.state_hash }).forUpdate().first();
            if (
                !current ||
                current.consumed_at ||
                current.expires_at <= new Date() ||
                (current.user_id && (current.user_id !== user.id || current.account_id !== account.id))
            )
                throw new OAuthConsentError(400, 'invalid_handoff');
            await this.enabled(account.uuid);
            const next = encodeURIComponent(oauthContinuation(state));
            const onboarding = user.account_discovery_pending
                ? 'account-discovery'
                : (await accountService.shouldShowHearAboutUs(account))
                  ? 'hear-about-us'
                  : null;
            if (onboarding) {
                req.session.oauthContinuation = oauthContinuation(state);
                await saveDashboardSession(req);
                return `${this.dashboardOrigin}/onboarding/${onboarding}?next=${next}`;
            }
            const code = opaqueSecret();
            await trx(HANDOFFS)
                .where({ state_hash: handoff.state_hash })
                .update({ user_id: user.id, account_id: account.id, code_hash: hashSecret(code), code_expires_at: new Date(Date.now() + HANDOFF_TTL_MS) });
            delete req.session.oauthContinuation;
            await saveDashboardSession(req);
            Object.assign(res.locals, identity);
            return `${this.issuer}/oauth/handoff/callback?code=${encodeURIComponent(code)}`;
        });
    }

    async consumeHandoff(req: Request, res: Response<any, RequestLocals>, code: string): Promise<void> {
        const browser: unknown = req.cookies?.[BROWSER_COOKIE];
        if (typeof browser !== 'string') throw new OAuthConsentError(400, 'invalid_handoff');
        const token = opaqueSecret();
        const candidate = await db
            .knex<Handoff>(HANDOFFS)
            .where({ code_hash: hashSecret(code) })
            .first('user_id');
        if (!candidate?.user_id) throw new OAuthConsentError(400, 'invalid_handoff');
        const redirectUrl = await db.knex.transaction(async (trx) => {
            await trx('_nango_users').where({ id: candidate.user_id }).forUpdate().first('id');
            const row = await trx<Handoff>(HANDOFFS)
                .where({ code_hash: hashSecret(code) })
                .forUpdate()
                .first();
            const now = new Date();
            if (
                !row ||
                row.consumed_at ||
                row.expires_at <= now ||
                !row.code_expires_at ||
                row.code_expires_at <= now ||
                !row.browser_hash.equals(hashSecret(browser)) ||
                row.issuer !== this.issuer ||
                row.return_to !== `${this.issuer}/oauth/interaction/${row.interaction_uid}` ||
                row.user_id !== candidate.user_id ||
                !row.user_id ||
                !row.account_id
            )
                throw new OAuthConsentError(400, 'invalid_handoff');
            const identity = await loadSessionIdentity(row.user_id, row.account_id, trx);
            if (!identity) throw new OAuthConsentError(400, 'invalid_handoff');
            await this.enabled(identity.account.uuid);
            const interaction = await this.interaction(req, res, row.interaction_uid);
            if (interaction.session?.accountId && interaction.session.accountId !== this.subject({ user_id: row.user_id, account_id: row.account_id }))
                throw new OAuthConsentError(400, 'invalid_handoff');
            const existingToken: unknown = req.cookies?.[LOGIN_COOKIE];
            if (typeof existingToken === 'string') {
                const existing = await trx<LoginSession>(SESSIONS)
                    .where({ token_hash: hashSecret(existingToken) })
                    .where('expires_at', '>', now)
                    .first();
                if (existing && (existing.user_id !== row.user_id || existing.account_id !== row.account_id))
                    throw new OAuthConsentError(400, 'invalid_handoff');
            }
            await trx(HANDOFFS).where({ state_hash: row.state_hash }).update({ consumed_at: now });
            await trx(SESSIONS).insert({
                token_hash: hashSecret(token),
                user_id: row.user_id,
                account_id: row.account_id,
                expires_at: new Date(Date.now() + LOGIN_TTL_MS)
            });
            Object.assign(res.locals, identity, { authType: 'session', plan: await getPlanSafe(trx, { accountId: row.account_id }) });
            return row.return_to;
        });
        res.cookie(LOGIN_COOKIE, token, this.cookieOptions(LOGIN_TTL_MS));
        res.clearCookie(BROWSER_COOKIE, this.cookieOptions(0));
        res.redirect(303, redirectUrl);
    }

    private subject(session: Pick<LoginSession, 'user_id' | 'account_id'>): string {
        return `${session.user_id}:${session.account_id}`;
    }
    private csrf(req: Request, uid: string, session: LoginSession): string {
        return createHmac('sha256', this.options.config.cookieKeys[0]!)
            .update(JSON.stringify([uid, session.user_id, session.account_id, req.cookies[LOGIN_COOKIE]]))
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
                if (!identity) throw new OAuthConsentError(401, 'unauthorized');
                const token: string = req.cookies[LOGIN_COOKIE];
                if (
                    !(await trx(SESSIONS)
                        .where({ token_hash: hashSecret(token) })
                        .where('expires_at', '>', new Date())
                        .first())
                )
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
