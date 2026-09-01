import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import passport from 'passport';

import { flagHasAuth, flagHasManagedAuth, flagHasUsage, isBasicAuthEnabled, isCloud, isEnterprise, isTest } from '@nangohq/utils';

import { can } from './authz/middleware.js';
import { setupAuth } from './clients/auth.client.js';
import connectionController from './controllers/connection.controller.js';
import environmentController from './controllers/environment.controller.js';
import flowController from './controllers/flow.controller.js';
import syncController from './controllers/sync.controller.js';
import { createAccountApiKey } from './controllers/v1/account/apiKeys/createApiKey.js';
import { deleteAccountApiKey } from './controllers/v1/account/apiKeys/deleteApiKey.js';
import { listAccountApiKeys } from './controllers/v1/account/apiKeys/listApiKeys.js';
import {
    confirmEmail,
    getEmailByExpiredToken,
    getEmailByUuid,
    getOnboardingAccountDiscovery,
    getOnboardingHearAboutUs,
    postOnboardingHearAboutUs,
    postOnboardingRequestInvite,
    resendVerificationEmailByEmail,
    resendVerificationEmailByUuid,
    signin,
    signup,
    validateSigninRequest
} from './controllers/v1/account/index.js';
import { getManagedCallback } from './controllers/v1/account/managed/getCallback.js';
import { getManagedEmailVerification } from './controllers/v1/account/managed/getVerification.js';
import { postManagedSignup } from './controllers/v1/account/managed/postSignup.js';
import { postManagedEmailVerification } from './controllers/v1/account/managed/postVerification.js';
import {
    deleteMFA,
    getMFAStatus,
    postMFAActivation,
    postMFAEnrollment,
    postMFALoginVerification,
    postMFARecoveryCodes
} from './controllers/v1/account/mfa/mfa.js';
import { postForgotPassword } from './controllers/v1/account/postForgotPassword.js';
import { postLogout } from './controllers/v1/account/postLogout.js';
import { putResetPassword } from './controllers/v1/account/putResetPassword.js';
import { postImpersonate } from './controllers/v1/admin/impersonate/postImpersonate.js';
import { getAuditTrail } from './controllers/v1/audit-trail/getAuditTrail.js';
import { getAuditTrailExport } from './controllers/v1/audit-trail/getAuditTrailExport.js';
import { postInternalConnectSessions } from './controllers/v1/connect/sessions/postConnectSessions.js';
import { deleteConnection } from './controllers/v1/connections/connectionId/deleteConnection.js';
import { getConnection as getConnectionWeb } from './controllers/v1/connections/connectionId/getConnection.js';
import { patchConnection } from './controllers/v1/connections/connectionId/patchConnection.js';
import { postConnectionMetadata } from './controllers/v1/connections/connectionId/postConnectionMetadata.js';
import { getConnectionRefresh } from './controllers/v1/connections/connectionId/postRefresh.js';
import { getConnectionRecordModels } from './controllers/v1/connections/connectionId/records/getModels.js';
import { getConnectionRecords } from './controllers/v1/connections/connectionId/records/getRecords.js';
import { getConnections } from './controllers/v1/connections/getConnections.js';
import { getConnectionsCount } from './controllers/v1/connections/getConnectionsCount.js';
import { getConnectUISettings } from './controllers/v1/connectUISettings/getConnectUISettings.js';
import { putConnectUISettings } from './controllers/v1/connectUISettings/putConnectUISettings.js';
import { createApiKey } from './controllers/v1/environment/createApiKey.js';
import { deleteApiKey } from './controllers/v1/environment/deleteApiKey.js';
import { deleteEnvironment } from './controllers/v1/environment/deleteEnvironment.js';
import { getEnvironment } from './controllers/v1/environment/getEnvironment.js';
import { getEnvironments } from './controllers/v1/environment/getEnvironments.js';
import { listApiKeys } from './controllers/v1/environment/listApiKeys.js';
import { patchApiKey } from './controllers/v1/environment/patchApiKey.js';
import { patchEnvironment } from './controllers/v1/environment/patchEnvironment.js';
import { postEnvironment } from './controllers/v1/environment/postEnvironment.js';
import { postRotateWebhookSigningKey } from './controllers/v1/environment/postRotateWebhookSigningKey.js';
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
import { deleteIntegrationFunction } from './controllers/v1/integrations/providerConfigKey/functions/deleteFunction.js';
import { getIntegrationFunctionCode } from './controllers/v1/integrations/providerConfigKey/functions/getCode.js';
import { getIntegrationFunction } from './controllers/v1/integrations/providerConfigKey/functions/getFunction.js';
import { getIntegrationFunctions } from './controllers/v1/integrations/providerConfigKey/functions/getFunctions.js';
import { getIntegration } from './controllers/v1/integrations/providerConfigKey/getIntegration.js';
import { patchIntegration } from './controllers/v1/integrations/providerConfigKey/patchIntegration.js';
import { getIntegrationTemplates } from './controllers/v1/integrations/providerConfigKey/templates/getTemplates.js';
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
import { getPlainHmac } from './controllers/v1/plain/getHmac.js';
import { deleteSpendAlert } from './controllers/v1/plans/billing/deleteSpendAlert.js';
import { getBillingPeriodCosts } from './controllers/v1/plans/billing/getBillingPeriodCosts.js';
import { getOverdueInvoices } from './controllers/v1/plans/billing/getOverdueInvoices.js';
import { getSpendAlert } from './controllers/v1/plans/billing/getSpendAlert.js';
import { getUpcomingInvoice } from './controllers/v1/plans/billing/getUpcomingInvoice.js';
import { putInvoicingDetails } from './controllers/v1/plans/billing/putInvoicingDetails.js';
import { putSpendAlert } from './controllers/v1/plans/billing/putSpendAlert.js';
import { postPlanChange } from './controllers/v1/plans/change/postChange.js';
import { getCurrentPlan } from './controllers/v1/plans/getCurrent.js';
import { getPlans } from './controllers/v1/plans/getPlans.js';
import { postPlanExtendTrial } from './controllers/v1/plans/trial/postPlanExtendTrial.js';
import { getBillingUsage } from './controllers/v1/plans/usage/getBillingUsage.js';
import { getBillingUsageTopDimensionValues } from './controllers/v1/plans/usage/getBillingUsageTopDimensionValues.js';
import { getUsage } from './controllers/v1/plans/usage/getUsage.js';
import { getProviderItem } from './controllers/v1/providers/getProvider.js';
import { getProvidersList } from './controllers/v1/providers/getProviders.js';
import { getProviderTemplates } from './controllers/v1/providers/providerConfigKey/templates/getTemplates.js';
import { deleteStripePaymentMethod } from './controllers/v1/stripe/payment_methods/deletePaymentMethod.js';
import { getStripePaymentMethods } from './controllers/v1/stripe/payment_methods/getPaymentMethods.js';
import { postStripeCollectPayment } from './controllers/v1/stripe/payment_methods/postCollectPayment.js';
import { postStripeWebhooks } from './controllers/v1/stripe/postWebhooks.js';
import { getTeam } from './controllers/v1/team/getTeam.js';
import { putTeam } from './controllers/v1/team/putTeam.js';
import { deleteTeamUser } from './controllers/v1/team/users/deleteTeamUser.js';
import { patchTeamUser } from './controllers/v1/team/users/patchTeamUser.js';
import { postTriggerFunction } from './controllers/v1/trigger/postTriggerFunction.js';
import { getUser } from './controllers/v1/user/getUser.js';
import { putUserPassword } from './controllers/v1/user/password/putPassword.js';
import { patchUser } from './controllers/v1/user/patchUser.js';
import authMiddleware from './middleware/access.middleware.js';
import {
    auditAccountApiKeyCreated,
    auditAccountApiKeyDeleted,
    auditApiKeyCreated,
    auditApiKeyDeleted,
    auditApiKeyUpdated,
    auditAppAuthPasswordChanged,
    auditAuthLogin,
    auditAuthLogout,
    auditAuthManagedCallback,
    auditAuthManagedVerification,
    auditAuthPasswordReset,
    auditAuthSignup,
    auditBillingDetailsChanged,
    auditBillingPaymentMethodAdded,
    auditBillingPaymentMethodRemoved,
    auditBillingPlanChanged,
    auditBillingSpendAlertChanged,
    auditBillingSpendAlertRemoved,
    auditBillingTrialExtended,
    auditConnectionDeleted,
    auditConnectionMetadataUpdated,
    auditConnectionRefreshed,
    auditConnectionUpdated,
    auditEnvironmentCreated,
    auditEnvironmentDeleted,
    auditEnvironmentUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhookUrlsChanged,
    auditFunctionDeleted,
    auditFunctionUpgraded,
    auditIntegrationCreated,
    auditIntegrationDeleted,
    auditIntegrationUpdated,
    auditMemberInviteAccepted,
    auditMemberInvited,
    auditMemberInviteDeclined,
    auditMemberInviteRevoked,
    auditMemberRemoved,
    auditMemberRoleChanged,
    auditMfaDisabled,
    auditMfaEnabled,
    auditMfaEnrolled,
    auditMfaRecoveryRegenerated,
    auditMfaVerified,
    auditPreBuiltDeployed,
    auditSyncCommand,
    auditSyncDisabled,
    auditSyncEnabled,
    auditSyncFrequencyChanged,
    auditTeamUpdated,
    auditTrailExported,
    auditTrailQueried,
    auditUserUpdated,
    auditWebhookSigningKeyRotated
} from './middleware/audit/index.js';
import { authenticateLocalSignin } from './middleware/authenticateLocalSignin.middleware.js';
import { jsonContentTypeMiddleware } from './middleware/json.middleware.js';
import { rateLimiterMiddleware } from './middleware/ratelimit.middleware.js';
import { isAllowedWebCorsOrigin } from './utils/cors.js';

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
    exposedHeaders: 'Authorization, Etag, Content-Type, Content-Length, Set-Cookie, X-Nango-Audit-Export-Truncated',
    // Allow exact origins and PR preview subdomains (e.g. pr-123.app-development.nango.dev)
    origin: (origin, callback) => {
        callback(null, isAllowedWebCorsOrigin(origin));
    },
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
    web.route('/account/signup').post(rateLimiterMiddleware, auditAuthSignup, signup);
    web.route('/account/logout').post(rateLimiterMiddleware, auditAuthLogout, postLogout);
    web.route('/account/signin').post(rateLimiterMiddleware, validateSigninRequest, auditAuthLogin, authenticateLocalSignin, signin);
    web.route('/account/forgot-password').post(rateLimiterMiddleware, postForgotPassword);
    web.route('/account/reset-password').put(rateLimiterMiddleware, auditAuthPasswordReset, putResetPassword);
    web.route('/account/resend-verification-email/by-uuid').post(rateLimiterMiddleware, resendVerificationEmailByUuid);
    web.route('/account/resend-verification-email/by-email').post(rateLimiterMiddleware, resendVerificationEmailByEmail);
    web.route('/account/email/:uuid').get(rateLimiterMiddleware, getEmailByUuid);
    web.route('/account/email/expired-token/:token').get(rateLimiterMiddleware, getEmailByExpiredToken);
    web.route('/account/verify/code').post(rateLimiterMiddleware, confirmEmail);
}

if (flagHasManagedAuth) {
    web.route('/account/managed/signup').post(rateLimiterMiddleware, postManagedSignup);
    web.route('/account/managed/verification').get(rateLimiterMiddleware, getManagedEmailVerification);
    web.route('/account/managed/verification').post(rateLimiterMiddleware, auditAuthManagedVerification, postManagedEmailVerification);
    web.route('/account/managed/callback').get(rateLimiterMiddleware, auditAuthManagedCallback, getManagedCallback);
    // TODO: drop this one
    web.route('/login/callback').get(rateLimiterMiddleware, auditAuthManagedCallback, getManagedCallback);
}

// --- Protected
web.route('/meta').get(webAuth, getMeta);
web.route('/account/onboarding/hear-about-us').get(webAuth, getOnboardingHearAboutUs);
web.route('/account/onboarding/hear-about-us').post(webAuth, postOnboardingHearAboutUs);
web.route('/account/onboarding/account-discovery').get(webAuth, getOnboardingAccountDiscovery);
web.route('/account/onboarding/request-invite').post(webAuth, postOnboardingRequestInvite);
web.route('/account/mfa').get(webAuth, getMFAStatus).delete(webAuth, auditMfaDisabled, deleteMFA);
web.route('/account/mfa/enroll').post(webAuth, auditMfaEnrolled, postMFAEnrollment);
web.route('/account/mfa/activate').post(webAuth, auditMfaEnabled, postMFAActivation);
web.route('/account/mfa/recovery-codes').post(webAuth, auditMfaRecoveryRegenerated, postMFARecoveryCodes);
web.route('/account/mfa/login/verify').post(rateLimiterMiddleware, auditMfaVerified, postMFALoginVerification);

// Team
web.route('/team').get(webAuth, getTeam);
web.route('/team').put(webAuth, auditTeamUpdated, can('account:team:update'), putTeam);
web.route('/team/users/:id').delete(webAuth, auditMemberRemoved, can('account:team:users:delete'), deleteTeamUser);
web.route('/team/users/:id').patch(webAuth, auditMemberRoleChanged, can('account:team:users:update'), patchTeamUser);

// Invitations
web.route('/invite').post(webAuth, auditMemberInvited, can('account:invites:create'), postInvite);
web.route('/invite').delete(webAuth, auditMemberInviteRevoked, can('account:invites:delete'), deleteInvite);
web.route('/invite/:id').get(rateLimiterMiddleware, getInvite);
web.route('/invite/:id').post(webAuth, auditMemberInviteAccepted, acceptInvite);
web.route('/invite/:id').delete(webAuth, auditMemberInviteDeclined, declineInvite);

// Plans
web.route('/plans').get(webAuth, getPlans);
web.route('/plans/current').get(webAuth, getCurrentPlan);
web.route('/plans/trial/extension').post(webAuth, auditBillingTrialExtended, can('account:plan:update'), postPlanExtendTrial);
web.route('/plans/usage').get(webAuth, getUsage);
web.route('/plans/billing-usage').get(webAuth, getBillingUsage);
web.route('/plans/billing-usage/top-dimension-values').get(webAuth, getBillingUsageTopDimensionValues);
web.route('/plans/billing/invoicing').put(webAuth, auditBillingDetailsChanged, can('account:plan:update'), putInvoicingDetails);
web.route('/plans/billing/overdue').get(webAuth, getOverdueInvoices);
web.route('/plans/billing/upcoming-invoice').get(webAuth, getUpcomingInvoice);
web.route('/plans/billing/period-costs').get(webAuth, getBillingPeriodCosts);
web.route('/plans/billing/spend-alert').get(webAuth, can('account:billing:spend_alert:read'), getSpendAlert);
web.route('/plans/billing/spend-alert').put(webAuth, auditBillingSpendAlertChanged, can('account:billing:spend_alert:update'), putSpendAlert);
web.route('/plans/billing/spend-alert').delete(webAuth, auditBillingSpendAlertRemoved, can('account:billing:spend_alert:update'), deleteSpendAlert);
web.route('/plans/change').post(webAuth, auditBillingPlanChanged, can('account:plan:update'), postPlanChange);

// Environments
web.route('/environments').get(webAuth, getEnvironments);
web.route('/environments').post(webAuth, auditEnvironmentCreated, can('account:environments:create'), postEnvironment);
web.route('/environments/').patch(webAuth, auditEnvironmentUpdated, can('environment:settings:update'), patchEnvironment);
web.route('/environments/').delete(webAuth, auditEnvironmentDeleted, can('environment:delete'), deleteEnvironment);
web.route('/environments/current').get(webAuth, can('environment:settings:read'), getEnvironment);
web.route('/environments/webhook').patch(webAuth, auditEnvironmentWebhookUrlsChanged, can('environment:webhooks:update'), patchWebhook);
web.route('/environments/variables').post(webAuth, auditEnvironmentVariablesChanged, can('environment:variables:update'), postEnvironmentVariables);

// API Key management
web.route('/account/api-keys').get(webAuth, can('account:api_keys:list'), listAccountApiKeys);
web.route('/account/api-keys').post(webAuth, auditAccountApiKeyCreated, can('account:api_keys:create'), createAccountApiKey);
web.route('/account/api-keys/:keyId').delete(webAuth, auditAccountApiKeyDeleted, can('account:api_keys:delete'), deleteAccountApiKey);

web.route('/environment/api-keys').get(webAuth, can('environment:api_keys:list'), listApiKeys);
web.route('/environment/api-keys').post(webAuth, auditApiKeyCreated, can('environment:api_keys:create'), createApiKey);
web.route('/environment/api-keys/:keyId').patch(webAuth, auditApiKeyUpdated, can('environment:api_keys:update'), patchApiKey);
web.route('/environment/api-keys/:keyId').delete(webAuth, auditApiKeyDeleted, can('environment:api_keys:delete'), deleteApiKey);

web.route('/environment/webhook-signing-key/rotate').post(
    webAuth,
    auditWebhookSigningKeyRotated,
    can('environment:webhook_signing_key:rotate'),
    postRotateWebhookSigningKey
);

web.route('/environment/hmac').get(webAuth, environmentController.getHmacDigest.bind(environmentController));
web.route('/environment/admin-auth').get(webAuth, can('environment:settings:update'), environmentController.getAdminAuthInfo.bind(environmentController));

// Connect
web.route('/connect/sessions').post(webAuth, can('environment:connections:update'), postInternalConnectSessions);

// Connect UI settings
web.route('/connect-ui-settings').get(webAuth, getConnectUISettings);
web.route('/connect-ui-settings').put(webAuth, can('account:connect_ui:update'), putConnectUISettings);

// Integrations
web.route('/integrations').get(webAuth, can('environment:integrations:list'), getIntegrations);
web.route('/integrations').post(webAuth, auditIntegrationCreated, can('environment:integrations:update'), postIntegration);
web.route('/integrations/:providerConfigKey').get(webAuth, can('environment:integrations:read'), getIntegration);
web.route('/integrations/:providerConfigKey').patch(webAuth, auditIntegrationUpdated, can('environment:integrations:update'), patchIntegration);
web.route('/integrations/:providerConfigKey').delete(webAuth, auditIntegrationDeleted, can('environment:integrations:delete'), deleteIntegration);
web.route('/integrations/:providerConfigKey/flows').get(webAuth, can('environment:functions:list'), getIntegrationFlows);
web.route('/integrations/:providerConfigKey/functions').get(webAuth, can('environment:functions:list'), getIntegrationFunctions);
web.route('/integrations/:providerConfigKey/functions/:functionName')
    .get(webAuth, can('environment:functions:read'), getIntegrationFunction)
    .delete(webAuth, auditFunctionDeleted, can('environment:functions:delete'), deleteIntegrationFunction);
web.route('/integrations/:providerConfigKey/functions/:functionName/code').get(webAuth, can('environment:functions:read'), getIntegrationFunctionCode);
web.route('/integrations/:providerConfigKey/templates').get(webAuth, can('environment:functions:list'), getIntegrationTemplates);

// Providers
web.route('/providers').get(webAuth, getProvidersList);
web.route('/providers/:providerConfigKey').get(webAuth, getProviderItem);
web.route('/providers/:providerConfigKey/templates').get(webAuth, getProviderTemplates);

// Connections
web.route('/connections').get(webAuth, can('environment:connections:list'), getConnections);
web.route('/connections/count').get(webAuth, can('environment:connections:list'), getConnectionsCount);
web.route('/connections/:connectionId').get(webAuth, can('environment:connections:read'), getConnectionWeb);
web.route('/connections/:connectionId/records/models').get(webAuth, can('environment:connections:read'), getConnectionRecordModels);
web.route('/connections/:connectionId/records').get(webAuth, can('environment:connections:read'), getConnectionRecords);
web.route('/connections/:connectionId/refresh').post(webAuth, auditConnectionRefreshed, can('environment:connections:update'), getConnectionRefresh);
web.route('/connections/:connectionId/metadata').post(webAuth, auditConnectionMetadataUpdated, can('environment:connections:update'), postConnectionMetadata);
web.route('/connections/:connectionId').patch(webAuth, auditConnectionUpdated, can('environment:connections:update'), patchConnection);
web.route('/connections/:connectionId').delete(webAuth, auditConnectionDeleted, can('environment:connections:delete'), deleteConnection);
web.route('/connections/admin/:connectionId').delete(
    webAuth,
    can('environment:settings:update'),
    connectionController.deleteAdminConnection.bind(connectionController)
);

// User
web.route('/user').get(webAuth, getUser);
web.route('/user').patch(webAuth, auditUserUpdated, patchUser);
web.route('/user/password').put(webAuth, auditAppAuthPasswordChanged, putUserPassword);

// Plain (in-app support chat)
web.route('/plain').get(webAuth, getPlainHmac);

// Sync / Flows
web.route('/sync').get(webAuth, can('environment:syncs:read'), syncController.getSyncsByParams.bind(syncController));
web.route('/sync/command').post(webAuth, auditSyncCommand, can('environment:syncs:execute'), syncController.syncCommand.bind(syncController));
web.route('/flows/pre-built/deploy').post(webAuth, auditPreBuiltDeployed, can('environment:deploy'), postPreBuiltDeploy);
web.route('/flows/pre-built/upgrade').put(webAuth, auditFunctionUpgraded, can('environment:deploy'), putUpgradePreBuilt);
web.route('/flows/:id/disable').patch(webAuth, auditSyncDisabled, can('environment:syncs:update'), patchFlowDisable);
web.route('/flows/:id/enable').patch(webAuth, auditSyncEnabled, can('environment:syncs:update'), patchFlowEnable);
web.route('/flows/:id/frequency').patch(webAuth, auditSyncFrequencyChanged, can('environment:syncs:update'), patchFlowFrequency);
web.route('/flows/:id/download').get(webAuth, can('environment:functions:read'), getFlowDownload);
web.route('/flow/:flowName').get(webAuth, can('environment:functions:read'), flowController.getFlow.bind(syncController));

web.route('/trigger/function').post(webAuth, can('environment:syncs:execute'), postTriggerFunction);

// Getting Started
web.route('/getting-started').get(webAuth, getGettingStarted);
web.route('/getting-started').patch(webAuth, patchGettingStarted);

// Logs
web.route('/audit-trail').get(webAuth, auditTrailQueried, can('account:audit_trail:read'), getAuditTrail);
web.route('/audit-trail/export').get(webAuth, auditTrailExported, can('account:audit_trail:read'), getAuditTrailExport);
web.route('/logs/operations').post(webAuth, can('environment:logs:read'), searchOperations);
web.route('/logs/messages').post(webAuth, can('environment:logs:read'), searchMessages);
web.route('/logs/filters').post(webAuth, can('environment:logs:read'), searchFilters);
web.route('/logs/operations/:operationId').get(webAuth, can('environment:logs:read'), getOperation);
web.route('/logs/insights').post(webAuth, can('environment:logs:read'), postInsights);

// Stripe / Billing
if (flagHasUsage) {
    web.route('/stripe/payment_methods').get(webAuth, can('account:billing:payment_methods:list'), getStripePaymentMethods);
    web.route('/stripe/payment_methods').post(webAuth, auditBillingPaymentMethodAdded, can('account:billing:payment_methods:create'), postStripeCollectPayment);
    web.route('/stripe/payment_methods').delete(
        webAuth,
        auditBillingPaymentMethodRemoved,
        can('account:billing:payment_methods:delete'),
        deleteStripePaymentMethod
    );
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
