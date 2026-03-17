import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import passport from 'passport';

import { basePublicUrl, baseUrl, flagHasAuth, flagHasManagedAuth, flagHasUsage, isBasicAuthEnabled, isCloud, isEnterprise, isTest } from '@nangohq/utils';

import { authzMiddleware, envScope, registerPermission } from './authz/index.js';
import { setupAuth } from './clients/auth.client.js';
import connectionController from './controllers/connection.controller.js';
import environmentController from './controllers/environment.controller.js';
import flowController from './controllers/flow.controller.js';
import syncController from './controllers/sync.controller.js';
import {
    getEmailByExpiredToken,
    getEmailByUuid,
    getOnboardingHearAboutUs,
    postOnboardingHearAboutUs,
    resendVerificationEmailByEmail,
    resendVerificationEmailByUuid,
    signin,
    signup,
    validateEmailAndLogin
} from './controllers/v1/account/index.js';
import { getManagedCallback } from './controllers/v1/account/managed/getCallback.js';
import { postManagedSignup } from './controllers/v1/account/managed/postSignup.js';
import { postForgotPassword } from './controllers/v1/account/postForgotPassword.js';
import { postLogout } from './controllers/v1/account/postLogout.js';
import { putResetPassword } from './controllers/v1/account/putResetPassword.js';
import { postImpersonate } from './controllers/v1/admin/impersonate/postImpersonate.js';
import { getApiStatus } from './controllers/v1/apiStatus/getApiStatus.js';
import { postInternalConnectSessions } from './controllers/v1/connect/sessions/postConnectSessions.js';
import { getConnectUISettings } from './controllers/v1/connectUISettings/getConnectUISettings.js';
import { putConnectUISettings } from './controllers/v1/connectUISettings/putConnectUISettings.js';
import { deleteConnection } from './controllers/v1/connections/connectionId/deleteConnection.js';
import { getConnection as getConnectionWeb } from './controllers/v1/connections/connectionId/getConnection.js';
import { getConnectionRefresh } from './controllers/v1/connections/connectionId/postRefresh.js';
import { getConnections } from './controllers/v1/connections/getConnections.js';
import { getConnectionsCount } from './controllers/v1/connections/getConnectionsCount.js';
import { deleteEnvironment } from './controllers/v1/environment/deleteEnvironment.js';
import { getEnvironment } from './controllers/v1/environment/getEnvironment.js';
import { getEnvironments } from './controllers/v1/environment/getEnvironments.js';
import { patchEnvironment } from './controllers/v1/environment/patchEnvironment.js';
import { postEnvironment } from './controllers/v1/environment/postEnvironment.js';
import { postEnvironmentVariables } from './controllers/v1/environment/variables/postVariables.js';
import { patchWebhook } from './controllers/v1/environment/webhook/patchWebhook.js';
import { patchFlowDisable } from './controllers/v1/flows/id/patchDisable.js';
import { patchFlowEnable } from './controllers/v1/flows/id/patchEnable.js';
import { patchFlowFrequency } from './controllers/v1/flows/id/patchFrequency.js';
import { postPreBuiltDeploy } from './controllers/v1/flows/preBuilt/postDeploy.js';
import { putUpgradePreBuilt } from './controllers/v1/flows/preBuilt/putUpgrade.js';
import { getGettingStarted } from './controllers/v1/gettingStarted/getGettingStarted.js';
import { patchGettingStarted } from './controllers/v1/gettingStarted/patchGettingStarted.js';
import { getIntegrations } from './controllers/v1/integrations/getIntegrations.js';
import { postIntegration } from './controllers/v1/integrations/postIntegration.js';
import { deleteIntegration } from './controllers/v1/integrations/providerConfigKey/deleteIntegration.js';
import { getIntegrationFlows } from './controllers/v1/integrations/providerConfigKey/flows/getFlows.js';
import { getIntegration } from './controllers/v1/integrations/providerConfigKey/getIntegration.js';
import { patchIntegration } from './controllers/v1/integrations/providerConfigKey/patchIntegration.js';
import { acceptInvite } from './controllers/v1/invite/acceptInvite.js';
import { declineInvite } from './controllers/v1/invite/declineInvite.js';
import { deleteInvite } from './controllers/v1/invite/deleteInvite.js';
import { getInvite } from './controllers/v1/invite/getInvite.js';
import { postInvite } from './controllers/v1/invite/postInvite.js';
import { getOperation } from './controllers/v1/logs/getOperation.js';
import { postInsights } from './controllers/v1/logs/postInsights.js';
import { searchFilters } from './controllers/v1/logs/searchFilters.js';
import { searchMessages } from './controllers/v1/logs/searchMessages.js';
import { searchOperations } from './controllers/v1/logs/searchOperations.js';
import { getMeta } from './controllers/v1/meta/getMeta.js';
import { postOrbWebhooks } from './controllers/v1/orb/postWebhooks.js';
import { postPlanChange } from './controllers/v1/plans/change/postChange.js';
import { getCurrentPlan } from './controllers/v1/plans/getCurrent.js';
import { getPlans } from './controllers/v1/plans/getPlans.js';
import { postPlanExtendTrial } from './controllers/v1/plans/trial/postPlanExtendTrial.js';
import { getBillingUsage } from './controllers/v1/plans/usage/getBillingUsage.js';
import { getUsage } from './controllers/v1/plans/usage/getUsage.js';
import { getProviderItem } from './controllers/v1/providers/getProvider.js';
import { getProvidersList } from './controllers/v1/providers/getProviders.js';
import { deleteStripePaymentMethod } from './controllers/v1/stripe/payment_methods/deletePaymentMethod.js';
import { getStripePaymentMethods } from './controllers/v1/stripe/payment_methods/getPaymentMethods.js';
import { postStripeCollectPayment } from './controllers/v1/stripe/payment_methods/postCollectPayment.js';
import { postStripeWebhooks } from './controllers/v1/stripe/postWebhooks.js';
import { getTeam } from './controllers/v1/team/getTeam.js';
import { putTeam } from './controllers/v1/team/putTeam.js';
import { deleteTeamUser } from './controllers/v1/team/users/deleteTeamUser.js';
import { getUser } from './controllers/v1/user/getUser.js';
import { putUserPassword } from './controllers/v1/user/password/putPassword.js';
import { patchUser } from './controllers/v1/user/patchUser.js';
import authMiddleware from './middleware/access.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { Permission } from './authz/index.js';
import type { ResolverFn } from './authz/resolvers.js';
import type { RequestLocals } from './utils/express.js';
import type { Request, RequestHandler, Response } from 'express';

let webAuth: RequestHandler[] = flagHasAuth
    ? [passport.authenticate('session') as RequestHandler, authMiddleware.sessionAuth.bind(authMiddleware), rateLimiterMiddleware, authzMiddleware]
    : isBasicAuthEnabled
      ? [
            passport.authenticate('basic', { session: false }) as RequestHandler,
            authMiddleware.basicAuth.bind(authMiddleware),
            rateLimiterMiddleware,
            authzMiddleware
        ]
      : [authMiddleware.noAuth.bind(authMiddleware), rateLimiterMiddleware, authzMiddleware];

// For integration test, we want to bypass session auth
if (isTest) {
    webAuth = [authMiddleware.testAuth.bind(authMiddleware), rateLimiterMiddleware, authzMiddleware];
}

const web = express.Router();
setupAuth(web);

// --- Security
const webCorsHandler = cors({
    maxAge: 600,
    allowedHeaders: 'Origin, Content-Type, sentry-trace, baggage',
    exposedHeaders: 'Authorization, Etag, Content-Type, Content-Length, Set-Cookie',
    origin: [basePublicUrl, baseUrl],
    credentials: true
});
web.use(webCorsHandler);
web.options('/', webCorsHandler); // Pre-flight
web.use('/', jsonContentTypeMiddleware);

// --- Body
const bodyLimit = '1mb';
web.use(
    express.json({
        limit: bodyLimit,
        verify: (req: Request, _, buf) => {
            req.rawBody = buf.toString(); // For stripe
        }
    })
);
web.use(bodyParser.raw({ limit: bodyLimit }));
web.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// --- Route helpers
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function protectedRoute(method: HttpMethod, path: string, handler: RequestHandler, permission: Permission | ResolverFn): void {
    const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    web.route(path)[m](...webAuth, handler);
    registerPermission(method, path, permission);
}

function openRoute(method: HttpMethod, path: string, handler: RequestHandler): void {
    const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    web.route(path)[m](...webAuth, handler);
}

// --- No auth
if (flagHasAuth) {
    web.route('/account/signup').post(rateLimiterMiddleware, signup);
    web.route('/account/logout').post(rateLimiterMiddleware, postLogout);
    web.route('/account/signin').post(rateLimiterMiddleware, passport.authenticate('local'), signin);
    web.route('/account/forgot-password').post(rateLimiterMiddleware, postForgotPassword);
    web.route('/account/reset-password').put(rateLimiterMiddleware, putResetPassword);
    web.route('/account/resend-verification-email/by-uuid').post(rateLimiterMiddleware, resendVerificationEmailByUuid);
    web.route('/account/resend-verification-email/by-email').post(rateLimiterMiddleware, resendVerificationEmailByEmail);
    web.route('/account/email/:uuid').get(rateLimiterMiddleware, getEmailByUuid);
    web.route('/account/email/expired-token/:token').get(rateLimiterMiddleware, getEmailByExpiredToken);
    web.route('/account/verify/code').post(rateLimiterMiddleware, validateEmailAndLogin);
}

if (flagHasManagedAuth) {
    web.route('/account/managed/signup').post(rateLimiterMiddleware, postManagedSignup);
    web.route('/account/managed/callback').get(rateLimiterMiddleware, getManagedCallback);
    // TODO: drop this one
    web.route('/login/callback').get(rateLimiterMiddleware, getManagedCallback);
}

// --- Protected (open = no authz restriction, protected = authz enforced)
openRoute('GET', '/meta', getMeta);
openRoute('GET', '/account/onboarding/hear-about-us', getOnboardingHearAboutUs);
openRoute('POST', '/account/onboarding/hear-about-us', postOnboardingHearAboutUs);

// Team
openRoute('GET', '/team', getTeam);
protectedRoute('PUT', '/team', putTeam, { action: 'write', resource: 'team', scope: 'global' });
protectedRoute('DELETE', '/team/users/:id', deleteTeamUser, { action: 'delete', resource: 'team_member', scope: 'global' });

// Invitations
protectedRoute('POST', '/invite', postInvite, { action: 'write', resource: 'invite', scope: 'global' });
protectedRoute('DELETE', '/invite', deleteInvite, { action: 'delete', resource: 'invite', scope: 'global' });
web.route('/invite/:id').get(rateLimiterMiddleware, getInvite);
openRoute('POST', '/invite/:id', acceptInvite);
openRoute('DELETE', '/invite/:id', declineInvite);

// Plans
openRoute('GET', '/plans', getPlans);
openRoute('GET', '/plans/current', getCurrentPlan);
protectedRoute('POST', '/plans/trial/extension', postPlanExtendTrial, { action: 'write', resource: 'plan', scope: 'global' });
openRoute('GET', '/plans/usage', getUsage);
openRoute('GET', '/plans/billing-usage', getBillingUsage);
protectedRoute('POST', '/plans/change', postPlanChange, { action: 'write', resource: 'plan', scope: 'global' });

// Environments
openRoute('GET', '/environments', getEnvironments);
protectedRoute('POST', '/environments', postEnvironment, { action: 'create', resource: 'environment', scope: 'global' });
protectedRoute('PATCH', '/environments/', patchEnvironment, (l: RequestLocals) => ({ action: 'write', resource: 'environment', scope: envScope(l) }));
protectedRoute('DELETE', '/environments/', deleteEnvironment, (l: RequestLocals) => ({ action: 'delete', resource: 'environment', scope: envScope(l) }));
protectedRoute('GET', '/environments/current', getEnvironment, (l: RequestLocals) => ({ action: 'read', resource: 'environment', scope: envScope(l) }));
protectedRoute('PATCH', '/environments/webhook', patchWebhook, (l: RequestLocals) => ({ action: 'write', resource: 'webhook', scope: envScope(l) }));
protectedRoute('POST', '/environments/variables', postEnvironmentVariables, (l: RequestLocals) => ({
    action: 'write',
    resource: 'environment_variable',
    scope: envScope(l)
}));

openRoute('GET', '/environment/hmac', environmentController.getHmacDigest.bind(environmentController));
protectedRoute('POST', '/environment/rotate-key', environmentController.rotateKey.bind(environmentController), (l: RequestLocals) => ({
    action: 'write',
    resource: 'environment_key',
    scope: envScope(l)
}));
protectedRoute('POST', '/environment/revert-key', environmentController.revertKey.bind(environmentController), (l: RequestLocals) => ({
    action: 'write',
    resource: 'environment_key',
    scope: envScope(l)
}));
protectedRoute('POST', '/environment/activate-key', environmentController.activateKey.bind(environmentController), (l: RequestLocals) => ({
    action: 'write',
    resource: 'environment_key',
    scope: envScope(l)
}));
openRoute('GET', '/environment/admin-auth', environmentController.getAdminAuthInfo.bind(environmentController));

// Connect
protectedRoute('POST', '/connect/sessions', postInternalConnectSessions, (l: RequestLocals) => ({
    action: 'write',
    resource: 'connection',
    scope: envScope(l)
}));

// Connect UI settings
openRoute('GET', '/connect-ui-settings', getConnectUISettings);
protectedRoute('PUT', '/connect-ui-settings', putConnectUISettings, { action: 'write', resource: 'connect_ui_settings', scope: 'global' });

// Integrations
protectedRoute('GET', '/integrations', getIntegrations, (l: RequestLocals) => ({ action: 'read', resource: 'integration', scope: envScope(l) }));
protectedRoute('POST', '/integrations', postIntegration, (l: RequestLocals) => ({ action: 'write', resource: 'integration', scope: envScope(l) }));
protectedRoute('GET', '/integrations/:providerConfigKey', getIntegration, (l: RequestLocals) => ({
    action: 'read',
    resource: 'integration',
    scope: envScope(l)
}));
protectedRoute('PATCH', '/integrations/:providerConfigKey', patchIntegration, (l: RequestLocals) => ({
    action: 'write',
    resource: 'integration',
    scope: envScope(l)
}));
protectedRoute('DELETE', '/integrations/:providerConfigKey', deleteIntegration, (l: RequestLocals) => ({
    action: 'delete',
    resource: 'integration',
    scope: envScope(l)
}));
openRoute('GET', '/integrations/:providerConfigKey/flows', getIntegrationFlows);

// Providers
openRoute('GET', '/providers', getProvidersList);
openRoute('GET', '/providers/:providerConfigKey', getProviderItem);

// Connections
protectedRoute('GET', '/connections', getConnections, (l: RequestLocals) => ({ action: 'read', resource: 'connection', scope: envScope(l) }));
protectedRoute('GET', '/connections/count', getConnectionsCount, (l: RequestLocals) => ({ action: 'read', resource: 'connection', scope: envScope(l) }));
protectedRoute('GET', '/connections/:connectionId', getConnectionWeb, (l: RequestLocals) => ({ action: 'read', resource: 'connection', scope: envScope(l) }));
protectedRoute('POST', '/connections/:connectionId/refresh', getConnectionRefresh, (l: RequestLocals) => ({
    action: 'write',
    resource: 'connection',
    scope: envScope(l)
}));
protectedRoute('DELETE', '/connections/:connectionId', deleteConnection, (l: RequestLocals) => ({
    action: 'delete',
    resource: 'connection',
    scope: envScope(l)
}));
openRoute('DELETE', '/connections/admin/:connectionId', connectionController.deleteAdminConnection.bind(connectionController));

// User
openRoute('GET', '/user', getUser);
openRoute('PATCH', '/user', patchUser);
openRoute('PUT', '/user/password', putUserPassword);

// Sync / Flows
openRoute('GET', '/sync', syncController.getSyncsByParams.bind(syncController));
protectedRoute('POST', '/sync/command', syncController.syncCommand.bind(syncController), (l: RequestLocals) => ({
    action: 'write',
    resource: 'sync_command',
    scope: envScope(l)
}));
protectedRoute('POST', '/flows/pre-built/deploy', postPreBuiltDeploy, (l: RequestLocals) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
protectedRoute('PUT', '/flows/pre-built/upgrade', putUpgradePreBuilt, (l: RequestLocals) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
openRoute('POST', '/flow/download', flowController.downloadFlow.bind(flowController));
protectedRoute('PATCH', '/flows/:id/disable', patchFlowDisable, (l: RequestLocals) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
protectedRoute('PATCH', '/flows/:id/enable', patchFlowEnable, (l: RequestLocals) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
protectedRoute('PATCH', '/flows/:id/frequency', patchFlowFrequency, (l: RequestLocals) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
openRoute('GET', '/flow/:flowName', flowController.getFlow.bind(syncController));

// Getting Started
openRoute('GET', '/getting-started', getGettingStarted);
openRoute('PATCH', '/getting-started', patchGettingStarted);

// Logs
protectedRoute('POST', '/logs/operations', searchOperations, (l: RequestLocals) => ({ action: 'read', resource: 'log', scope: envScope(l) }));
protectedRoute('POST', '/logs/messages', searchMessages, (l: RequestLocals) => ({ action: 'read', resource: 'log', scope: envScope(l) }));
protectedRoute('POST', '/logs/filters', searchFilters, (l: RequestLocals) => ({ action: 'read', resource: 'log', scope: envScope(l) }));
protectedRoute('GET', '/logs/operations/:operationId', getOperation, (l: RequestLocals) => ({ action: 'read', resource: 'log', scope: envScope(l) }));
protectedRoute('POST', '/logs/insights', postInsights, (l: RequestLocals) => ({ action: 'read', resource: 'log', scope: envScope(l) }));

// Stripe / Billing
if (flagHasUsage) {
    protectedRoute('GET', '/stripe/payment_methods', getStripePaymentMethods, { action: '*', resource: 'billing', scope: 'global' });
    protectedRoute('POST', '/stripe/payment_methods', postStripeCollectPayment, { action: '*', resource: 'billing', scope: 'global' });
    protectedRoute('DELETE', '/stripe/payment_methods', deleteStripePaymentMethod, { action: '*', resource: 'billing', scope: 'global' });
    web.route('/stripe/webhooks').post(rateLimiterMiddleware, postStripeWebhooks);

    web.route('/orb/webhooks').post((_req, _res, next) => {
        // Skip rate limiting of Orb webhooks. Rate limit errors can accidentally disable the Orb
        // webhook and there is no way to control the type or frequency of the webhooks from within Orb.
        next();
    }, postOrbWebhooks);
}

openRoute('POST', '/admin/impersonate', postImpersonate);

openRoute('GET', '/api-status/:service', getApiStatus);

// Hosted signin
if (!isCloud && !isEnterprise) {
    web.route('/basic').get(webAuth, (_: Request, res: Response) => {
        res.status(200).send();
    });
}

// -------
// 404
web.use('/api/*splat', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'endpoint not found' } });
});

export const privateApi = web;
