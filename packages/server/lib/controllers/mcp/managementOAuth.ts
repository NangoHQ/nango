import { metrics } from '@nangohq/utils';

import { getAuthorizedManagementMcpEnvironments } from './oauth/access.js';
import { managementMcpOAuthArtifactExists } from './oauth/adapter.js';
import { getManagementMcpOAuthConfig, isManagementMcpOAuthEnabled, MANAGEMENT_MCP_OAUTH_SCOPE } from './oauth/config.js';
import { getManagementMcpOAuthGrantContext } from './oauth/grant.js';
import { getManagementMcpOAuthProvider } from './oauth/provider.js';

import type { RequestLocals } from '../../utils/express.js';
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Request, RequestHandler, Response } from 'express';

export const getManagementOAuthProtectedResourceMetadata: RequestHandler = (_, res) => {
    if (!isManagementMcpOAuthEnabled()) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(getProtectedResourceMetadata());
};

export const getManagementOAuthAuthorizationServerMetadata: RequestHandler = (_, res) => {
    if (!isManagementMcpOAuthEnabled()) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(getAuthorizationServerMetadata());
};

export const managementOAuthAuth: RequestHandler = async (req, res, next) => {
    if (!isManagementMcpOAuthEnabled()) {
        next();
        return;
    }

    const token = parseBearerToken(req);
    if (!token) {
        sendBearerChallenge(res);
        return;
    }

    const config = getManagementMcpOAuthConfig();
    const provider = getManagementMcpOAuthProvider();
    const accessToken = await provider?.AccessToken.find(token);
    if (!provider) {
        next();
        return;
    }
    if (!accessToken) {
        const isOAuthArtifact = await managementMcpOAuthArtifactExists('AccessToken', token, config.storageKey);
        if (!isOAuthArtifact) {
            next();
            return;
        }
        sendBearerChallenge(res, 'invalid_token');
        return;
    }
    if (!accessToken.grantId || !accessToken.clientId) {
        sendBearerChallenge(res, 'invalid_token');
        return;
    }

    const rawAudience: unknown = accessToken.aud;
    const audience = Array.isArray(rawAudience) ? rawAudience : typeof rawAudience === 'string' ? [rawAudience] : [];
    if (!audience.includes(config.resource)) {
        sendBearerChallenge(res, 'invalid_token');
        return;
    }
    if (!accessToken.scopes.has(MANAGEMENT_MCP_OAUTH_SCOPE)) {
        sendBearerChallenge(res, 'insufficient_scope', 403);
        return;
    }

    const [providerGrant, client, context] = await Promise.all([
        provider.Grant.find(accessToken.grantId),
        provider.Client.find(accessToken.clientId),
        getManagementMcpOAuthGrantContext(accessToken.grantId)
    ]);
    if (!providerGrant || !client || !context || context.grant.client_id !== accessToken.clientId || context.grant.resource !== config.resource) {
        sendBearerChallenge(res, 'invalid_token');
        return;
    }
    const locals = res.locals as Partial<RequestLocals>;
    locals.authType = 'mcpOAuth';
    locals.user = context.user;
    locals.account = context.account;
    locals.plan = context.plan;
    locals.mcpOAuthScopes = [MANAGEMENT_MCP_OAUTH_SCOPE];
    const authorizedEnvironments = await getAuthorizedManagementMcpEnvironments({
        user: context.user,
        account: context.account,
        plan: context.plan,
        environments: context.environments
    });
    if (authorizedEnvironments.length === 0) {
        sendBearerChallenge(res, 'insufficient_scope', 403);
        return;
    }
    locals.mcpOAuthEnvironments = authorizedEnvironments;
    next();
};

export const managementOAuthUnauthorized: RequestHandler = (_, res) => {
    sendBearerChallenge(res);
};

function getProtectedResourceMetadata(): OAuthProtectedResourceMetadata {
    const config = getManagementMcpOAuthConfig();
    return {
        resource: config.resource,
        authorization_servers: [config.issuer],
        scopes_supported: [MANAGEMENT_MCP_OAUTH_SCOPE],
        bearer_methods_supported: ['header'],
        resource_name: 'Nango Management MCP server'
    };
}

function getAuthorizationServerMetadata(): OAuthMetadata & { client_id_metadata_document_supported: true } {
    const { issuer } = getManagementMcpOAuthConfig();
    return {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        revocation_endpoint: `${issuer}/revoke`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: [MANAGEMENT_MCP_OAUTH_SCOPE],
        client_id_metadata_document_supported: true
    };
}

function parseBearerToken(req: Request): string | null {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    return token || null;
}

function sendBearerChallenge(res: Response, error?: 'invalid_token' | 'insufficient_scope', status = 401): void {
    const config = getManagementMcpOAuthConfig();
    const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', config.resource).toString();
    const attributes = [`resource_metadata="${metadataUrl}"`, `scope="${MANAGEMENT_MCP_OAUTH_SCOPE}"`];
    if (error) {
        attributes.unshift(`error="${error}"`);
        metrics.increment(metrics.Types.MCP_OAUTH_INVALID_TOKEN, 1, { reason: error });
    }
    res.setHeader('WWW-Authenticate', `Bearer ${attributes.join(', ')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ error });
}
