import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import passport from 'passport';

import { permissions as p } from '@nangohq/authz';
import { basePublicUrl, baseUrl, flagHasAuth, flagHasManagedAuth, flagHasUsage, isBasicAuthEnabled, isCloud, isEnterprise, isTest } from '@nangohq/utils';

import { can, envScope } from './authz/middleware.js';
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
import { getManagedEmailVerification } from './controllers/v1/account/managed/getVerification.js';
import { postManagedSignup } from './controllers/v1/account/managed/postSignup.js';
import { postManagedEmailVerification } from './controllers/v1/account/managed/postVerification.js';
import { postForgotPassword } from './controllers/v1/account/postForgotPassword.js';
import { postLogout } from './controllers/v1/account/postLogout.js';
import { putResetPassword } from './controllers/v1/account/putResetPassword.js';
import { postImpersonate } from './controllers/v1/admin/impersonate/postImpersonate.js';
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
import { getFlowDownload } from './controllers/v1/flow/getDownload.js';
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
import { patchTeamUser } from './controllers/v1/team/users/patchTeamUser.js';
import { getUser } from './controllers/v1/user/getUser.js';
import { putUserPassword } from './controllers/v1/user/password/putPassword.js';
import { patchUser } from './controllers/v1/user/patchUser.js';
import authMiddleware from './middleware/access.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';

import type { Request, RequestHandler, Response } from 'express';

let webAuth: RequestHandler[] = flagHasAuth
    ? [passport.authenticate('session') as RequestHandler, authMiddleware.sessionAuth.bind(authMiddleware), rateLimiterMiddleware]
    : isBasicAuthEnabled
      ? [passport.authenticate('basic', { session: false }) as RequestHandler, authMiddleware.basicAuth.bind(authMiddleware), rateLimiterMiddleware]
      : [authMiddleware.noAuth.bind(authMiddleware), rateLimiterMiddleware];

// For integration test, we want to bypass session auth
if (isTest) {
    webAuth = [authMiddleware.testAuth.bind(authMiddleware), rateLimiterMiddleware];
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
    web.route('/account/managed/verification').get(rateLimiterMiddleware, getManagedEmailVerification);
    web.route('/account/managed/verification').post(rateLimiterMiddleware, postManagedEmailVerification);
    web.route('/account/managed/callback').get(rateLimiterMiddleware, getManagedCallback);
    // TODO: drop this one
    web.route('/login/callback').get(rateLimiterMiddleware, getManagedCallback);
}

// --- Protected
web.route('/meta').get(webAuth, getMeta);
web.route('/account/onboarding/hear-about-us').get(webAuth, getOnboardingHearAboutUs);
web.route('/account/onboarding/hear-about-us').post(webAuth, postOnboardingHearAboutUs);

// Team
web.route('/team').get(webAuth, getTeam);
web.route('/team').put(webAuth, can(p.canManageTeam), putTeam);
web.route('/team/users/:id').delete(webAuth, can(p.canRemoveTeamMember), deleteTeamUser);
web.route('/team/users/:id').patch(webAuth, can(p.canUpdateTeamMember), patchTeamUser);

// Invitations
web.route('/invite').post(webAuth, can(p.canInviteMember), postInvite);
web.route('/invite').delete(webAuth, can(p.canCancelInvitation), deleteInvite);
web.route('/invite/:id').get(rateLimiterMiddleware, getInvite);
web.route('/invite/:id').post(webAuth, acceptInvite);
web.route('/invite/:id').delete(webAuth, declineInvite);

// Plans
web.route('/plans').get(webAuth, getPlans);
web.route('/plans/current').get(webAuth, getCurrentPlan);
web.route('/plans/trial/extension').post(webAuth, can(p.canChangePlan), postPlanExtendTrial);
web.route('/plans/usage').get(webAuth, getUsage);
web.route('/plans/billing-usage').get(webAuth, getBillingUsage);
web.route('/plans/change').post(webAuth, can(p.canChangePlan), postPlanChange);

// Environments
web.route('/environments').get(webAuth, getEnvironments);
web.route('/environments').post(webAuth, can(p.canCreateEnvironment), postEnvironment);
web.route('/environments/').patch(webAuth, can({ action: 'update', resource: 'environment', scopedBy: envScope }), patchEnvironment);
web.route('/environments/').delete(webAuth, can({ action: 'delete', resource: 'environment', scopedBy: envScope }), deleteEnvironment);
web.route('/environments/current').get(webAuth, can({ action: 'read', resource: 'environment', scopedBy: envScope }), getEnvironment);
web.route('/environments/webhook').patch(webAuth, can({ action: 'update', resource: 'webhook', scopedBy: envScope }), patchWebhook);
web.route('/environments/variables').post(webAuth, can({ action: 'update', resource: 'environment_variable', scopedBy: envScope }), postEnvironmentVariables);

web.route('/environment/hmac').get(webAuth, environmentController.getHmacDigest.bind(environmentController));
web.route('/environment/rotate-key').post(
    webAuth,
    can({ action: 'update', resource: 'environment_key', scopedBy: envScope }),
    environmentController.rotateKey.bind(environmentController)
);
web.route('/environment/revert-key').post(
    webAuth,
    can({ action: 'update', resource: 'environment_key', scopedBy: envScope }),
    environmentController.revertKey.bind(environmentController)
);
web.route('/environment/activate-key').post(
    webAuth,
    can({ action: 'update', resource: 'environment_key', scopedBy: envScope }),
    environmentController.activateKey.bind(environmentController)
);
web.route('/environment/admin-auth').get(webAuth, environmentController.getAdminAuthInfo.bind(environmentController));

// Connect
web.route('/connect/sessions').post(webAuth, can({ action: 'update', resource: 'connection', scopedBy: envScope }), postInternalConnectSessions);

// Connect UI settings
web.route('/connect-ui-settings').get(webAuth, getConnectUISettings);
web.route('/connect-ui-settings').put(webAuth, can(p.canManageConnectUI), putConnectUISettings);

// Integrations
web.route('/integrations').get(webAuth, can({ action: 'read', resource: 'integration', scopedBy: envScope }), getIntegrations);
web.route('/integrations').post(webAuth, can({ action: 'update', resource: 'integration', scopedBy: envScope }), postIntegration);
web.route('/integrations/:providerConfigKey').get(webAuth, can({ action: 'read', resource: 'integration', scopedBy: envScope }), getIntegration);
web.route('/integrations/:providerConfigKey').patch(webAuth, can({ action: 'update', resource: 'integration', scopedBy: envScope }), patchIntegration);
web.route('/integrations/:providerConfigKey').delete(webAuth, can({ action: 'delete', resource: 'integration', scopedBy: envScope }), deleteIntegration);
web.route('/integrations/:providerConfigKey/flows').get(webAuth, getIntegrationFlows);

// Providers
web.route('/providers').get(webAuth, getProvidersList);
web.route('/providers/:providerConfigKey').get(webAuth, getProviderItem);

// Connections
web.route('/connections').get(webAuth, can({ action: 'read', resource: 'connection', scopedBy: envScope }), getConnections);
web.route('/connections/count').get(webAuth, can({ action: 'read', resource: 'connection', scopedBy: envScope }), getConnectionsCount);
web.route('/connections/:connectionId').get(webAuth, can({ action: 'read', resource: 'connection', scopedBy: envScope }), getConnectionWeb);
web.route('/connections/:connectionId/refresh').post(webAuth, can({ action: 'update', resource: 'connection', scopedBy: envScope }), getConnectionRefresh);
web.route('/connections/:connectionId').delete(webAuth, can({ action: 'delete', resource: 'connection', scopedBy: envScope }), deleteConnection);
web.route('/connections/admin/:connectionId').delete(webAuth, connectionController.deleteAdminConnection.bind(connectionController));

// User
web.route('/user').get(webAuth, getUser);
web.route('/user').patch(webAuth, patchUser);
web.route('/user/password').put(webAuth, putUserPassword);

// Sync / Flows
web.route('/sync').get(webAuth, can({ action: 'read', resource: 'flow', scopedBy: envScope }), syncController.getSyncsByParams.bind(syncController));
web.route('/sync/command').post(
    webAuth,
    can({ action: 'update', resource: 'sync_command', scopedBy: envScope }),
    syncController.syncCommand.bind(syncController)
);
web.route('/flows/pre-built/deploy').post(webAuth, can({ action: 'update', resource: 'flow', scopedBy: envScope }), postPreBuiltDeploy);
web.route('/flows/pre-built/upgrade').put(webAuth, can({ action: 'update', resource: 'flow', scopedBy: envScope }), putUpgradePreBuilt);
web.route('/flows/:id/disable').patch(webAuth, can({ action: 'update', resource: 'flow', scopedBy: envScope }), patchFlowDisable);
web.route('/flows/:id/enable').patch(webAuth, can({ action: 'update', resource: 'flow', scopedBy: envScope }), patchFlowEnable);
web.route('/flows/:id/frequency').patch(webAuth, can({ action: 'update', resource: 'flow', scopedBy: envScope }), patchFlowFrequency);
web.route('/flows/:id/download').get(webAuth, can({ action: 'read', resource: 'flow', scopedBy: envScope }), getFlowDownload);
web.route('/flow/:flowName').get(webAuth, flowController.getFlow.bind(syncController));

// Getting Started
web.route('/getting-started').get(webAuth, getGettingStarted);
web.route('/getting-started').patch(webAuth, patchGettingStarted);

// Logs
web.route('/logs/operations').post(webAuth, can({ action: 'read', resource: 'log', scopedBy: envScope }), searchOperations);
web.route('/logs/messages').post(webAuth, can({ action: 'read', resource: 'log', scopedBy: envScope }), searchMessages);
web.route('/logs/filters').post(webAuth, can({ action: 'read', resource: 'log', scopedBy: envScope }), searchFilters);
web.route('/logs/operations/:operationId').get(webAuth, can({ action: 'read', resource: 'log', scopedBy: envScope }), getOperation);
web.route('/logs/insights').post(webAuth, can({ action: 'read', resource: 'log', scopedBy: envScope }), postInsights);

// Stripe / Billing
if (flagHasUsage) {
    web.route('/stripe/payment_methods').get(webAuth, can(p.canManageBilling), getStripePaymentMethods);
    web.route('/stripe/payment_methods').post(webAuth, can(p.canManageBilling), postStripeCollectPayment);
    web.route('/stripe/payment_methods').delete(webAuth, can(p.canManageBilling), deleteStripePaymentMethod);
    web.route('/stripe/webhooks').post(rateLimiterMiddleware, postStripeWebhooks);

    web.route('/orb/webhooks').post((_req, _res, next) => {
        // Skip rate limiting of Orb webhooks. Rate limit errors can accidentally disable the Orb
        // webhook and there is no way to control the type or frequency of the webhooks from within Orb.
        next();
    }, postOrbWebhooks);
}

web.route('/admin/impersonate').post(webAuth, postImpersonate);

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
