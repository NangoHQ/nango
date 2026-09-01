import crypto from 'node:crypto';

import * as z from 'zod';

import db from '@nangohq/database';
import { accountService, getPlan, userService } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getManagementMcpOAuthConfig, MANAGEMENT_MCP_OAUTH_SCOPE } from './config.js';
import { activateManagementMcpOAuthGrant, createPendingManagementMcpOAuthGrant, deleteManagementMcpOAuthGrant } from './grant.js';
import { getManagementMcpOAuthProvider } from './provider.js';

import type { DBPlan, DBTeam, DBUser } from '@nangohq/types';
import type { Request, RequestHandler, Response } from 'express';
import type { Client, Interaction } from 'oidc-provider';

const approvalSchema = z.object({
    csrfToken: z.string().min(1)
});
const denialSchema = z.object({ csrfToken: z.string().min(1) });
const logger = getLogger('Audit.ManagementMcpOAuth');

export const getManagementMcpOAuthInteraction = asyncWrapper(async (req, res) => {
    const context = await getInteractionContext(req, res);
    if (!context || context.interaction.uid !== req.params['uid']) {
        res.status(404).json({ error: { code: 'interaction_not_found', message: 'OAuth interaction not found or expired.' } });
        return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
        client: {
            name: context.client.clientName ?? 'MCP client',
            uri: context.client.clientUri ?? null,
            redirectHost: new URL(String(context.interaction.params['redirect_uri'])).host
        },
        account: { name: context.account.name },
        scope: MANAGEMENT_MCP_OAUTH_SCOPE,
        csrfToken: createCsrfToken(context.interaction.uid, context.user.id)
    });
});

export const postManagementMcpOAuthInteractionApprove = asyncWrapper(async (req, res) => {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: { code: 'invalid_request', message: 'Invalid approval request.' } });
        return;
    }

    const context = await getInteractionContext(req, res);
    if (!context || context.interaction.uid !== req.params['uid']) {
        res.status(404).json({ error: { code: 'interaction_not_found', message: 'OAuth interaction not found or expired.' } });
        return;
    }
    if (!verifyCsrfToken(parsed.data.csrfToken, context.interaction.uid, context.user.id)) {
        res.status(403).json({ error: { code: 'invalid_csrf_token', message: 'Invalid CSRF token.' } });
        return;
    }

    const resource = context.interaction.params['resource'];
    const scope = context.interaction.params['scope'];
    const resources = Array.isArray(resource) ? resource : [resource];
    if (resources.length === 0 || resources.some((value) => value !== context.config.resource) || scope !== MANAGEMENT_MCP_OAUTH_SCOPE) {
        res.status(400).json({ error: { code: 'invalid_request', message: 'The requested OAuth resource or scope is invalid.' } });
        return;
    }

    const grant = new context.provider.Grant({ accountId: String(context.user.id), clientId: context.client.clientId });
    grant.jti = crypto.randomBytes(32).toString('base64url');
    // oidc-provider tracks statically declared OAuth scopes separately from resource-bound scopes.
    grant.addOIDCScope(MANAGEMENT_MCP_OAUTH_SCOPE);
    grant.addResourceScope(context.config.resource, MANAGEMENT_MCP_OAUTH_SCOPE);

    await createPendingManagementMcpOAuthGrant({
        grantId: grant.jti,
        userId: context.user.id,
        accountId: context.account.id,
        clientId: context.client.clientId,
        resource: context.config.resource,
        scopes: [MANAGEMENT_MCP_OAUTH_SCOPE]
    });

    try {
        await grant.save();
        await activateManagementMcpOAuthGrant(grant.jti);
    } catch (err) {
        await grant.destroy().catch(() => undefined);
        await deleteManagementMcpOAuthGrant(grant.jti);
        throw err;
    }

    const redirectTo = await context.provider.interactionResult(req, res, {
        login: { accountId: String(context.user.id), amr: ['nango'], ts: Math.floor(Date.now() / 1000) },
        consent: { grantId: grant.jti }
    });
    logger.info('Management MCP OAuth interaction approved', {
        event: 'interaction_approved',
        clientId: context.client.clientId,
        userId: context.user.id,
        accountId: context.account.id
    });
    metrics.increment(metrics.Types.MCP_OAUTH_EVENT, 1, { event: 'interaction_approved', outcome: 'success' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ redirectTo });
});

export const postManagementMcpOAuthInteractionDeny = asyncWrapper(async (req, res) => {
    const parsed = denialSchema.safeParse(req.body);
    const context = await getInteractionContext(req, res);
    if (!parsed.success || !context || context.interaction.uid !== req.params['uid']) {
        res.status(404).json({ error: { code: 'interaction_not_found', message: 'OAuth interaction not found or expired.' } });
        return;
    }
    if (!verifyCsrfToken(parsed.data.csrfToken, context.interaction.uid, context.user.id)) {
        res.status(403).json({ error: { code: 'invalid_csrf_token', message: 'Invalid CSRF token.' } });
        return;
    }

    const redirectTo = await context.provider.interactionResult(req, res, {
        error: 'access_denied',
        error_description: 'The user denied the authorization request.'
    });
    logger.info('Management MCP OAuth interaction denied', {
        event: 'interaction_denied',
        clientId: context.client.clientId,
        userId: context.user.id,
        accountId: context.account.id
    });
    metrics.increment(metrics.Types.MCP_OAUTH_EVENT, 1, { event: 'interaction_denied', outcome: 'success' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ redirectTo });
});

export const requireManagementMcpOAuthInteractionOrigin: RequestHandler = (req, res, next) => {
    const origin = req.get('origin');
    const expectedOrigin = new URL(getManagementMcpOAuthConfig().interactionUrl).origin;
    if (origin !== expectedOrigin) {
        res.status(403).json({ error: { code: 'invalid_origin', message: 'Invalid request origin.' } });
        return;
    }
    next();
};

async function getInteractionContext(
    req: Request,
    res: Response
): Promise<{
    provider: NonNullable<ReturnType<typeof getManagementMcpOAuthProvider>>;
    interaction: Interaction;
    client: Client;
    user: DBUser;
    account: DBTeam;
    plan: DBPlan | null;
    config: ReturnType<typeof getManagementMcpOAuthConfig>;
} | null> {
    if (!req.user) {
        return null;
    }
    const provider = getManagementMcpOAuthProvider();
    if (!provider) {
        return null;
    }

    const interaction = await provider.interactionDetails(req, res);
    const clientId = interaction.params['client_id'];
    if (typeof clientId !== 'string') {
        return null;
    }
    const [client, user] = await Promise.all([provider.Client.find(clientId), userService.getUserById(req.user.id)]);
    if (!client || !user) {
        return null;
    }
    const account = await accountService.getAccountById(db.knex, user.account_id);
    if (!account) {
        return null;
    }
    let plan: DBPlan | null = null;
    if (flagHasPlan) {
        const result = await getPlan(db.knex, { accountId: account.id });
        if (result.isErr()) {
            return null;
        }
        plan = result.value;
    }

    return { provider, interaction, client, user, account, plan, config: getManagementMcpOAuthConfig() };
}

function createCsrfToken(interactionId: string, userId: number): string {
    const secret = getManagementMcpOAuthConfig().cookieKeys[0];
    if (!secret) {
        throw new Error('Management MCP OAuth cookie key is unavailable');
    }
    return crypto.createHmac('sha256', secret).update(`${interactionId}:${userId}`).digest('base64url');
}

function verifyCsrfToken(actual: string, interactionId: string, userId: number): boolean {
    const expected = createCsrfToken(interactionId, userId);
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
