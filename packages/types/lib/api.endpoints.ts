import type {
    GetEmailByExpiredToken,
    GetEmailByUuid,
    GetManagedCallback,
    PostForgotPassword,
    PostLogout,
    PostManagedSignup,
    PostSignin,
    PostSignup,
    PutResetPassword
} from './account/api.js';
import type { GetAsyncActionResult } from './action/api.js';
import type { PostImpersonate } from './admin/http.api.js';
import type { EndpointMethod } from './api.js';
import type {
    PostPublicApiKeyAuthorization,
    PostPublicAppStoreAuthorization,
    PostPublicBasicAuthorization,
    PostPublicBillAuthorization,
    PostPublicJwtAuthorization,
    PostPublicOauthOutboundAuthorization,
    PostPublicSignatureAuthorization,
    PostPublicTbaAuthorization,
    PostPublicTwoStepAuthorization,
    PostPublicUnauthenticatedAuthorization
} from './auth/http.api.js';
import type {
    DeleteConnectSession,
    GetConnectSession,
    PostConnectSessions,
    PostInternalConnectSessions,
    PostPublicConnectSessionsReconnect,
    PostPublicConnectTelemetry
} from './connect/api.js';
import type {
    DeletePublicConnection,
    GetConnection,
    GetConnections,
    GetConnectionsCount,
    GetPublicConnection,
    GetPublicConnections,
    PostConnectionRefresh
} from './connection/api/get.js';
import type { SetMetadata, UpdateMetadata } from './connection/api/metadata.js';
import type { PostDeploy, PostDeployConfirmation, PostDeployInternal } from './deploy/api.js';
import type { DeleteEnvironment, PatchEnvironment, PostEnvironment } from './environment/api/index.js';
import type { PatchWebhook } from './environment/api/webhook.js';
import type { PostEnvironmentVariables } from './environment/variable/api.js';
import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from './flow/http.api.js';
import type {
    DeleteIntegration,
    DeletePublicIntegration,
    GetIntegration,
    GetIntegrationFlows,
    GetPublicIntegration,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    PatchIntegration,
    PatchPublicIntegration,
    PostIntegration,
    PostPublicIntegration
} from './integration/api.js';
import type { DeleteInvite, GetInvite, PostInvite } from './invitations/api.js';
import type { GetOperation, PostInsights, SearchFilters, SearchMessages, SearchOperations } from './logs/api.js';
import type { GetMeta } from './meta/api.js';
import type { PatchOnboarding } from './onboarding/api.js';
import type { PostPlanExtendTrial } from './plans/http.api.js';
import type { GetPublicProvider, GetPublicProviders } from './providers/api.js';
import type { GetPublicRecords } from './record/api.js';
import type { GetPublicScriptsConfig } from './scripts/http.api.js';
import type { PostPublicTrigger, PutPublicSyncConnectionFrequency } from './sync/api.js';
import type { DeleteTeamUser, GetTeam, PutTeam } from './team/api.js';
import type { GetUser, PatchUser } from './user/api.js';
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
    | PostPublicAppStoreAuthorization
    | GetPublicProviders
    | GetPublicProvider
    | GetPublicListIntegrationsLegacy
    | GetPublicListIntegrations
    | GetPublicIntegration
    | DeletePublicIntegration
    | PostConnectSessions
    | PostPublicConnectSessionsReconnect
    | GetPublicConnections
    | GetPublicConnection
    | GetConnectSession
    | DeleteConnectSession
    | PostDeployInternal
    | PostPublicBillAuthorization
    | DeletePublicConnection
    | PostPublicSignatureAuthorization
    | PostPublicTwoStepAuthorization
    | PostPublicWebhook
    | GetPublicRecords
    | GetPublicScriptsConfig
    | PostPublicConnectTelemetry
    | PutPublicSyncConnectionFrequency
    | PostPublicIntegration
    | PatchPublicIntegration
    | GetAsyncActionResult
    | PostPublicOauthOutboundAuthorization;

export type PrivateApiEndpoints =
    | PostSignup
    | PostSignin
    | PostLogout
    | GetTeam
    | PutTeam
    | PostPlanExtendTrial
    | GetUser
    | PatchUser
    | PostInvite
    | DeleteInvite
    | DeleteTeamUser
    | PostInsights
    | PostForgotPassword
    | PutResetPassword
    | SearchOperations
    | GetOperation
    | SearchMessages
    | SearchFilters
    | PatchOnboarding
    | PostInternalConnectSessions
    | GetIntegrationFlows
    | DeleteIntegration
    | PatchIntegration
    | GetIntegration
    | PostIntegration
    | GetConnections
    | GetConnectionsCount
    | GetConnection
    | GetInvite
    | GetMeta
    | GetEmailByExpiredToken
    | GetEmailByUuid
    | GetManagedCallback
    | PatchFlowDisable
    | PatchFlowEnable
    | PatchFlowFrequency
    | PutUpgradePreBuiltFlow
    | PostConnectionRefresh
    | PostManagedSignup
    | PostPreBuiltDeploy
    | PostEnvironment
    | PatchEnvironment
    | DeleteEnvironment
    | PatchWebhook
    | PostEnvironmentVariables
    | PostImpersonate;

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
