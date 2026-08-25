import type {
    ConfirmEmail,
    CreateAccountApiKey,
    DeleteAccountApiKey,
    GetEmailByExpiredToken,
    GetEmailByUuid,
    GetManagedCallback,
    GetManagedEmailVerification,
    GetOnboardingAccountDiscovery,
    ListAccountApiKeys,
    PostForgotPassword,
    PostLogout,
    PostManagedEmailVerification,
    PostManagedSignup,
    PostOnboardingRequestInvite,
    PostSignin,
    PostSignup,
    PutResetPassword
} from './account/api.js';
import type { GetAsyncActionResult, GetPublicV1, PostInternalTriggerFunction, PostPublicTriggerAction } from './action/api.js';
import type { PostImpersonate } from './admin/http.api.js';
import type { PostAgentSessions } from './agent/api.js';
import type { EndpointMethod } from './api.js';
import type { GetAuditTrail, GetAuditTrailExport } from './audit-trail/api.js';
import type {
    PostPublicApiKeyAuthorization,
    PostPublicAwsSigV4Authorization,
    PostPublicBasicAuthorization,
    PostPublicBillAuthorization,
    PostPublicJwtAuthorization,
    PostPublicOauthOutboundAuthorization,
    PostPublicSignatureAuthorization,
    PostPublicTbaAuthorization,
    PostPublicTwoStepAuthorization,
    PostPublicUnauthenticatedAuthorization
} from './auth/http.api.js';
import type { PostCliTelemetry } from './cli/api.js';
import type { GetPublicClientMetadata } from './clientMetadata/http.api.js';
import type {
    DeleteConnectSession,
    GetConnectSession,
    PostConnectSessions,
    PostInternalConnectSessions,
    PostPublicConnectSessionsReconnect,
    PostPublicConnectTelemetry
} from './connect/api.js';
import type {
    DeleteConnection,
    DeletePublicConnection,
    GetConnection,
    GetConnections,
    GetConnectionsCount,
    GetPublicConnection,
    GetPublicConnections,
    PatchConnection,
    PatchPublicConnection,
    PostConnectionRefresh,
    PostPublicConnection
} from './connection/api/get.js';
import type { PostConnectionMetadata, SetMetadata, UpdateMetadata } from './connection/api/metadata.js';
import type { GetConnectUISettings, PutConnectUISettings } from './connectUISettings/api.js';
import type { PostDeploy, PostDeployConfirmation, PostDeployInternal } from './deploy/api.js';
import type {
    CreateApiKey,
    DeleteApiKey,
    DeleteEnvironment,
    DeletePublicApiKey,
    DeletePublicEnvironment,
    GetEnvironment,
    GetEnvironments,
    ListApiKeys,
    PatchApiKey,
    PatchEnvironment,
    PostEnvironment,
    PostPublicApiKey,
    PostPublicEnvironment,
    PostPublicRotateWebhookSigningKey,
    PostRotateWebhookSigningKey
} from './environment/api/index.js';
import type { PatchWebhook } from './environment/api/webhook.js';
import type { PostEnvironmentVariables } from './environment/variable/api.js';
import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from './flow/http.api.js';
import type {
    DeleteIntegrationFunction,
    DeletePublicIntegrationFunction,
    GetFunctionDeployment,
    GetFunctionDryrun,
    GetFunctionInvocation,
    GetIntegrationFunction,
    GetIntegrationFunctions,
    GetIntegrationTemplates,
    GetProviderTemplates,
    GetPublicIntegrationFunction,
    GetPublicIntegrationFunctions,
    GetPublicProviderTemplates,
    PostFunctionCompile,
    PostFunctionDeployment,
    PostFunctionDeploymentBundle,
    PostFunctionDeploymentBundlePreview,
    PostFunctionDeploymentResult,
    PostFunctionDryrun,
    PostFunctionDryrunResult,
    PostFunctionInvocation
} from './functions/api.js';
import type { GetGettingStarted, PatchGettingStarted } from './gettingStarted/api.js';
import type {
    DeleteIntegration,
    DeletePublicIntegration,
    GetFunctionCode,
    GetIntegration,
    GetIntegrationFlows,
    GetPublicFunctionCode,
    GetPublicIntegration,
    GetPublicListIntegrations,
    PatchIntegration,
    PatchPublicIntegration,
    PostIntegration,
    PostPublicIntegration,
    PostPublicQuickstartIntegration
} from './integration/api.js';
import type { DeleteInvite, GetInvite, PostInvite } from './invitations/api.js';
import type { GetOperation, PostInsights, SearchFilters, SearchMessages, SearchOperations } from './logs/api.js';
import type { GetMeta } from './meta/api.js';
import type { DeleteMFA, GetMFAStatus, PostMFAActivation, PostMFAEnrollment, PostMFALoginVerification, PostMFARecoveryCodes } from './mfa/api.js';
import type { GetPlainHmac } from './plain/api.js';
import type {
    DeleteSpendAlert,
    GetBillingUsage,
    GetBillingUsageTopDimensionValues,
    GetOverdueInvoices,
    GetSpendAlert,
    GetUpcomingInvoice,
    PostPlanChange,
    PostPlanExtendTrial,
    PutBillingInvoicingDetails,
    PutSpendAlert
} from './plans/http.api.js';
import type { GetProvider, GetProviders, GetPublicProvider, GetPublicProviders } from './providers/api.js';
import type { AllPublicProxy } from './proxy/http.api.js';
import type { GetConnectionRecordModels, GetConnectionRecords, GetPublicRecords, PatchPublicPruneRecords } from './record/api.js';
import type { GetPublicScriptsConfig } from './scripts/http.api.js';
import type {
    GetSharedCredentialsProvider,
    GetSharedCredentialsProviders,
    PatchSharedCredentialsProvider,
    PostSharedCredentialsProvider
} from './sharedCredentials/api.js';
import type { GetPublicSyncStatus, PostPublicSyncPause, PostPublicSyncStart, PostPublicTrigger, PutPublicSyncConnectionFrequency } from './sync/api.js';
import type { DeleteTeamUser, GetTeam, PatchTeamUser, PutTeam } from './team/api.js';
import type { GetUser, PatchUser, PutUserPassword } from './user/api.js';
import type { PostPublicWebhook } from './webhooks/http.api.js';

export type PublicApiEndpoints =
    | SetMetadata
    | UpdateMetadata
    | PostDeploy
    | PostDeployConfirmation
    | PostPublicTrigger
    | PostPublicTbaAuthorization
    | PostPublicJwtAuthorization
    | PostPublicUnauthenticatedAuthorization
    | PostPublicApiKeyAuthorization
    | PostPublicBasicAuthorization
    | GetPublicProviders
    | GetPublicProvider
    | GetPublicListIntegrations
    | GetPublicIntegration
    | DeletePublicIntegration
    | PostConnectSessions
    | PostAgentSessions
    | PostPublicConnectSessionsReconnect
    | GetPublicConnections
    | GetPublicConnection
    | GetConnectSession
    | DeleteConnectSession
    | PostDeployInternal
    | PostPublicBillAuthorization
    | DeletePublicConnection
    | DeleteConnection
    | PostPublicSignatureAuthorization
    | PostPublicTwoStepAuthorization
    | PostPublicWebhook
    | GetPublicClientMetadata
    | GetPublicRecords
    | PatchPublicPruneRecords
    | GetPublicScriptsConfig
    | PostPublicConnectTelemetry
    | PostCliTelemetry
    | PutPublicSyncConnectionFrequency
    | PostPublicIntegration
    | PostPublicQuickstartIntegration
    | PatchPublicIntegration
    | GetAsyncActionResult
    | PostPublicOauthOutboundAuthorization
    | PostPublicAwsSigV4Authorization
    | PostPublicConnection
    | PatchPublicConnection
    | PostPublicSyncStart
    | PostPublicSyncPause
    | GetPublicSyncStatus
    | GetPublicV1
    | PostPublicTriggerAction
    | PostFunctionCompile
    | PostFunctionDryrun
    | GetFunctionDryrun
    | PostFunctionDryrunResult
    | PostFunctionDeployment
    | GetFunctionDeployment
    | PostFunctionDeploymentResult
    | PostFunctionInvocation
    | GetFunctionInvocation
    | PostFunctionDeploymentBundle
    | PostFunctionDeploymentBundlePreview
    | GetPublicFunctionCode
    | GetPublicIntegrationFunctions
    | GetPublicIntegrationFunction
    | DeletePublicIntegrationFunction
    | GetPublicProviderTemplates
    | PostPublicRotateWebhookSigningKey
    | AllPublicProxy
    | PostPublicEnvironment
    | DeletePublicEnvironment
    | PostPublicApiKey
    | DeletePublicApiKey;

export type PrivateApiEndpoints =
    | GetAuditTrail
    | GetAuditTrailExport
    | ListAccountApiKeys
    | CreateAccountApiKey
    | DeleteAccountApiKey
    | ConfirmEmail
    | PostSignup
    | PostSignin
    | PostLogout
    | GetTeam
    | PutTeam
    | PostPlanExtendTrial
    | PostPlanChange
    | PutBillingInvoicingDetails
    | GetOverdueInvoices
    | GetBillingUsage
    | GetBillingUsageTopDimensionValues
    | GetUpcomingInvoice
    | GetSpendAlert
    | PutSpendAlert
    | DeleteSpendAlert
    | GetUser
    | PatchUser
    | PutUserPassword
    | PostInvite
    | DeleteInvite
    | DeleteTeamUser
    | PatchTeamUser
    | PostInsights
    | PostForgotPassword
    | PutResetPassword
    | SearchOperations
    | GetOperation
    | SearchMessages
    | SearchFilters
    | PostInternalConnectSessions
    | GetIntegrationFlows
    | GetIntegrationFunction
    | GetIntegrationFunctions
    | GetFunctionCode
    | DeleteIntegrationFunction
    | GetIntegrationTemplates
    | GetProviderTemplates
    | DeleteIntegration
    | PatchIntegration
    | GetIntegration
    | PostIntegration
    | GetConnections
    | GetConnectionsCount
    | GetConnection
    | PatchConnection
    | PostConnectionMetadata
    | GetConnectionRecordModels
    | GetConnectionRecords
    | GetInvite
    | GetMeta
    | GetEmailByExpiredToken
    | GetEmailByUuid
    | GetManagedCallback
    | GetManagedEmailVerification
    | GetOnboardingAccountDiscovery
    | PostOnboardingRequestInvite
    | PatchFlowDisable
    | PatchFlowEnable
    | PatchFlowFrequency
    | PutUpgradePreBuiltFlow
    | PostConnectionRefresh
    | PostManagedEmailVerification
    | PostManagedSignup
    | PostPreBuiltDeploy
    | PostEnvironment
    | PatchEnvironment
    | DeleteEnvironment
    | GetEnvironments
    | GetEnvironment
    | PostRotateWebhookSigningKey
    | ListApiKeys
    | CreateApiKey
    | DeleteApiKey
    | PatchApiKey
    | PatchWebhook
    | PostEnvironmentVariables
    | PostImpersonate
    | GetSharedCredentialsProviders
    | GetSharedCredentialsProvider
    | PostSharedCredentialsProvider
    | PatchSharedCredentialsProvider
    | GetGettingStarted
    | PatchGettingStarted
    | GetConnectUISettings
    | PutConnectUISettings
    | GetProviders
    | GetProvider
    | PostInternalTriggerFunction
    | GetMFAStatus
    | PostMFAEnrollment
    | PostMFAActivation
    | PostMFARecoveryCodes
    | PostMFALoginVerification
    | DeleteMFA
    | GetPlainHmac;

export type APIEndpoints = PrivateApiEndpoints | PublicApiEndpoints;

/**
 * Automatically narrow endpoints type with Method + Path
 */
export type APIEndpointsPicker<TMethod extends EndpointMethod, TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Method: TMethod; Path: TPath }>;

/**
 * Automatically narrow endpoints type with Path
 * Useful to get allowed methods
 */
export type APIEndpointsPickerWithPath<TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Path: TPath }>;
