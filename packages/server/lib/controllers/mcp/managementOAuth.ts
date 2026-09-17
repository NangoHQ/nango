import db from '@nangohq/database';
import { accountService, getPlan, userService } from '@nangohq/shared';
import { flagHasPlan, tagTraceUser } from '@nangohq/utils';

import authMiddleware from '../../middleware/access.middleware.js';
import { oauthServer, oauthServerConfig } from '../../oauth/server.js';
import { getManagementMcpEnvironments } from './environments/list.js';

import type { RequestLocals } from '../../utils/express.js';
import type { Request, RequestHandler, Response } from 'express';

export const MANAGEMENT_MCP_OAUTH_SCOPE = 'environment:*';

type OAuthAuthenticationResult = { kind: 'authenticated' } | { kind: 'not_oauth' } | { kind: 'invalid_token' } | { kind: 'insufficient_scope' };

export const getManagementOAuthProtectedResourceMetadata: RequestHandler = (_req, res) => {
    if (!oauthServerConfig) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
        return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        resource: oauthServerConfig.resource.resource,
        authorization_servers: [oauthServerConfig.config.baseUrl],
        scopes_supported: [MANAGEMENT_MCP_OAUTH_SCOPE],
        bearer_methods_supported: ['header'],
        resource_name: 'Nango Management MCP server'
    });
};

export const managementMcpAuth: RequestHandler = async (req, res, next) => {
    if (!oauthServerConfig || !oauthServer) {
        await authMiddleware.secretKeyAuth(req, res, next);
        return;
    }

    try {
        const token = readBearerToken(req);
        if (token) {
            const oauthResult = await authenticateOAuthToken(token, res as Response<unknown, Partial<RequestLocals>>);
            if (oauthResult.kind === 'authenticated') {
                next();
                return;
            }
            if (oauthResult.kind === 'invalid_token') {
                sendBearerChallenge(res, 'invalid_token');
                return;
            }
            if (oauthResult.kind === 'insufficient_scope') {
                sendBearerChallenge(res, 'insufficient_scope', 403);
                return;
            }
        }

        const apiKeyResult = await authMiddleware.authenticateSecretKey(req, res);
        if (apiKeyResult.isOk()) {
            next();
            return;
        }
        sendBearerChallenge(res);
    } catch (err) {
        next(err);
    }
};

async function authenticateOAuthToken(token: string, res: Response<unknown, Partial<RequestLocals>>): Promise<OAuthAuthenticationResult> {
    if (!oauthServerConfig || !oauthServer) {
        return { kind: 'not_oauth' };
    }

    const accessToken = await oauthServer.AccessToken.find(token);
    if (!accessToken) {
        return { kind: 'not_oauth' };
    }

    const resource = oauthServerConfig.resource.resource;
    if (!hasExactAudience(accessToken.aud, resource) || !accessToken.scopes.has(MANAGEMENT_MCP_OAUTH_SCOPE)) {
        return hasExactAudience(accessToken.aud, resource) ? { kind: 'insufficient_scope' } : { kind: 'invalid_token' };
    }
    if (!accessToken.grantId || !accessToken.clientId || !accessToken.accountId) {
        return { kind: 'invalid_token' };
    }

    let providerGrant;
    let client;
    try {
        [providerGrant, client] = await Promise.all([
            oauthServer.Grant.find(accessToken.grantId),
            // Re-resolve the CIMD client instead of trusting the client identifier carried by the token.
            oauthServer.Client.find(accessToken.clientId)
        ]);
    } catch {
        return { kind: 'invalid_token' };
    }

    const grantResourceScopes = providerGrant?.getResourceScope(resource)?.split(' ').filter(Boolean) ?? [];
    if (
        !providerGrant ||
        !client ||
        providerGrant.clientId !== accessToken.clientId ||
        client.clientId !== accessToken.clientId ||
        providerGrant.accountId !== accessToken.accountId ||
        !grantResourceScopes.includes(MANAGEMENT_MCP_OAUTH_SCOPE)
    ) {
        return { kind: 'invalid_token' };
    }

    const userId = parsePositiveInteger(accessToken.accountId);
    if (!userId) {
        return { kind: 'invalid_token' };
    }
    const user = await userService.getUserById(userId);
    if (!user || String(user.id) !== providerGrant.accountId) {
        return { kind: 'invalid_token' };
    }
    const account = await accountService.getAccountById(db.knex, user.account_id);
    if (!account) {
        return { kind: 'invalid_token' };
    }

    let plan = null;
    if (flagHasPlan) {
        const planResult = await getPlan(db.knex, { accountId: account.id });
        if (planResult.isErr()) {
            return { kind: 'invalid_token' };
        }
        plan = planResult.value;
    }

    const environments = await getManagementMcpEnvironments({ account });
    res.locals.authType = 'mcpOAuth';
    res.locals.user = user;
    res.locals.account = account;
    res.locals.plan = plan;
    res.locals.mcpOAuthEnvironments = environments;
    tagTraceUser({ account, plan });
    return { kind: 'authenticated' };
}

function hasExactAudience(value: unknown, resource: string): boolean {
    return value === resource || (Array.isArray(value) && value.length === 1 && value[0] === resource);
}

function parsePositiveInteger(value: unknown): number | null {
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value ? parsed : null;
}

function readBearerToken(req: Request): string | null {
    const authorization = req.get('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return null;
    }
    const token = match[1]?.trim();
    return token || null;
}

function sendBearerChallenge(res: Response, error?: 'invalid_token' | 'insufficient_scope', status = 401): void {
    if (!oauthServerConfig) {
        throw new Error('Management MCP OAuth challenge requested while OAuth is disabled');
    }
    const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', oauthServerConfig.resource.resource).href;
    const attributes = [`resource_metadata="${metadataUrl}"`, `scope="${MANAGEMENT_MCP_OAUTH_SCOPE}"`];
    if (error) {
        attributes.unshift(`error="${error}"`);
    }
    res.setHeader('WWW-Authenticate', `Bearer ${attributes.join(', ')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ error: error ?? 'unauthorized' });
}
