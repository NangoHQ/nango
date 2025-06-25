import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import passport from 'passport';

import { basePublicUrl, baseUrl, flagHasAuth, flagHasManagedAuth, flagHasUsage, isBasicAuthEnabled, isCloud, isEnterprise, isTest } from '@nangohq/utils';

import { setupAuth } from './clients/auth.client.js';
import accountController from './controllers/account.controller.js';
import configController from './controllers/config.controller.js';
import connectionController from './controllers/connection.controller.js';
import environmentController from './controllers/environment.controller.js';
import flowController from './controllers/flow.controller.js';
import syncController from './controllers/sync.controller.js';
import userController from './controllers/user.controller.js';
import {
    getEmailByExpiredToken,
    getEmailByUuid,
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
import { postInternalConnectSessions } from './controllers/v1/connect/sessions/postConnectSessions.js';
import { deleteConnection } from './controllers/v1/connections/connectionId/deleteConnection.js';
import { getConnection as getConnectionWeb } from './controllers/v1/connections/connectionId/getConnection.js';
import { getConnectionRefresh } from './controllers/v1/connections/connectionId/postRefresh.js';
import { getConnections } from './controllers/v1/connections/getConnections.js';
import { getConnectionsCount } from './controllers/v1/connections/getConnectionsCount.js';
import { deleteEnvironment } from './controllers/v1/environment/deleteEnvironment.js';
import { getEnvironment } from './controllers/v1/environment/getEnvironment.js';
import { patchEnvironment } from './controllers/v1/environment/patchEnvironment.js';
import { postEnvironment } from './controllers/v1/environment/postEnvironment.js';
import { postEnvironmentVariables } from './controllers/v1/environment/variables/postVariables.js';
import { patchWebhook } from './controllers/v1/environment/webhook/patchWebhook.js';
import { patchFlowDisable } from './controllers/v1/flows/id/patchDisable.js';
import { patchFlowEnable } from './controllers/v1/flows/id/patchEnable.js';
import { patchFlowFrequency } from './controllers/v1/flows/id/patchFrequency.js';
import { postPreBuiltDeploy } from './controllers/v1/flows/preBuilt/postDeploy.js';
import { putUpgradePreBuilt } from './controllers/v1/flows/preBuilt/putUpgrade.js';
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
import { patchOnboarding } from './controllers/v1/onboarding/patchOnboarding.js';
import { postOrbWebhooks } from './controllers/v1/orb/postWebhooks.js';
import { postPlanChange } from './controllers/v1/plans/change/postChange.js';
import { getPlanCurrent } from './controllers/v1/plans/getCurrent.js';
import { getPlans } from './controllers/v1/plans/getPlans.js';
import { postPlanExtendTrial } from './controllers/v1/plans/trial/postPlanExtendTrial.js';
import { getUsage } from './controllers/v1/plans/usage/getUsage.js';
import { deleteStripePaymentMethod } from './controllers/v1/stripe/payment_methods/deletePaymentMethod.js';
import { getStripePaymentMethods } from './controllers/v1/stripe/payment_methods/getPaymentMethods.js';
import { postStripeCollectPayment } from './controllers/v1/stripe/payment_methods/postCollectPayment.js';
import { postStripeWebhooks } from './controllers/v1/stripe/postWebhooks.js';
import { getTeam } from './controllers/v1/team/getTeam.js';
import { putTeam } from './controllers/v1/team/putTeam.js';
import { deleteTeamUser } from './controllers/v1/team/users/deleteTeamUser.js';
import { getUser } from './controllers/v1/user/getUser.js';
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
    webAuth = [authMiddleware.secretKeyAuth.bind(authMiddleware), rateLimiterMiddleware];
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
    web.route('/account/managed/callback').get(rateLimiterMiddleware, getManagedCallback);
    // TODO: drop this one
    web.route('/login/callback').get(rateLimiterMiddleware, getManagedCallback);
}

// --- Protected
web.route('/meta').get(webAuth, getMeta);
web.route('/team').get(webAuth, getTeam);
web.route('/team').put(webAuth, putTeam);
web.route('/team/users/:id').delete(webAuth, deleteTeamUser);
web.route('/invite').post(webAuth, postInvite);
web.route('/invite').delete(webAuth, deleteInvite);
web.route('/invite/:id').get(rateLimiterMiddleware, getInvite);
web.route('/invite/:id').post(webAuth, acceptInvite);
web.route('/invite/:id').delete(webAuth, declineInvite);
web.route('/account/admin/switch').post(webAuth, accountController.switchAccount.bind(accountController));

web.route('/plans').get(webAuth, getPlans);
web.route('/plans/current').get(webAuth, getPlanCurrent);
web.route('/plans/trial/extension').post(webAuth, postPlanExtendTrial);
web.route('/plans/usage').get(webAuth, getUsage);
web.route('/plans/change').post(webAuth, postPlanChange);

web.route('/environments').post(webAuth, postEnvironment);
web.route('/environments/').patch(webAuth, patchEnvironment);
web.route('/environments/').delete(webAuth, deleteEnvironment);
web.route('/environments/current').get(webAuth, getEnvironment);
web.route('/environments/webhook').patch(webAuth, patchWebhook);
web.route('/environments/variables').post(webAuth, postEnvironmentVariables);

web.route('/environment/hmac').get(webAuth, environmentController.getHmacDigest.bind(environmentController));
web.route('/environment/rotate-key').post(webAuth, environmentController.rotateKey.bind(accountController));
web.route('/environment/revert-key').post(webAuth, environmentController.revertKey.bind(accountController));
web.route('/environment/activate-key').post(webAuth, environmentController.activateKey.bind(accountController));
web.route('/environment/admin-auth').get(webAuth, environmentController.getAdminAuthInfo.bind(environmentController));

web.route('/connect/sessions').post(webAuth, postInternalConnectSessions);

web.route('/integrations').get(webAuth, getIntegrations);
web.route('/integrations').post(webAuth, postIntegration);
web.route('/integrations/:providerConfigKey').get(webAuth, getIntegration);
web.route('/integrations/:providerConfigKey').patch(webAuth, patchIntegration);
web.route('/integrations/:providerConfigKey').delete(webAuth, deleteIntegration);
web.route('/integrations/:providerConfigKey/flows').get(webAuth, getIntegrationFlows);

web.route('/provider').get(configController.listProvidersFromYaml.bind(configController));

web.route('/connections').get(webAuth, getConnections);
web.route('/connections/count').get(webAuth, getConnectionsCount);
web.route('/connections/:connectionId').get(webAuth, getConnectionWeb);
web.route('/connections/:connectionId/refresh').post(webAuth, getConnectionRefresh);
web.route('/connections/:connectionId').delete(webAuth, deleteConnection);
web.route('/connections/admin/:connectionId').delete(webAuth, connectionController.deleteAdminConnection.bind(connectionController));

web.route('/user').get(webAuth, getUser);
web.route('/user').patch(webAuth, patchUser);
web.route('/user/password').put(webAuth, userController.editPassword.bind(userController));

web.route('/sync').get(webAuth, syncController.getSyncsByParams.bind(syncController));
web.route('/sync/command').post(webAuth, syncController.syncCommand.bind(syncController));
web.route('/syncs').get(webAuth, syncController.getSyncs.bind(syncController));
web.route('/flows').get(webAuth, flowController.getFlows.bind(syncController));
web.route('/flows/pre-built/deploy').post(webAuth, postPreBuiltDeploy);
web.route('/flows/pre-built/upgrade').put(webAuth, putUpgradePreBuilt);
web.route('/flow/download').post(webAuth, flowController.downloadFlow.bind(flowController));
web.route('/flows/:id/disable').patch(webAuth, patchFlowDisable);
web.route('/flows/:id/enable').patch(webAuth, patchFlowEnable);
web.route('/flows/:id/frequency').patch(webAuth, patchFlowFrequency);
web.route('/flow/:flowName').get(webAuth, flowController.getFlow.bind(syncController));

web.route('/onboarding').patch(webAuth, patchOnboarding);

web.route('/logs/operations').post(webAuth, searchOperations);
web.route('/logs/messages').post(webAuth, searchMessages);
web.route('/logs/filters').post(webAuth, searchFilters);
web.route('/logs/operations/:operationId').get(webAuth, getOperation);
web.route('/logs/insights').post(webAuth, postInsights);

if (flagHasUsage) {
    web.route('/stripe/payment_methods').get(webAuth, getStripePaymentMethods);
    web.route('/stripe/payment_methods').post(webAuth, postStripeCollectPayment);
    web.route('/stripe/payment_methods').delete(webAuth, deleteStripePaymentMethod);
    web.route('/stripe/webhooks').post(rateLimiterMiddleware, postStripeWebhooks);

    web.route('/orb/webhooks').post(rateLimiterMiddleware, postOrbWebhooks);
}

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
