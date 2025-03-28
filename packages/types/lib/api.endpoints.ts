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
} from './account/api';
import type { EndpointMethod } from './api';
import type {
    PostPublicApiKeyAuthorization,
    PostPublicAppStoreAuthorization,
    PostPublicBasicAuthorization,
    PostPublicBillAuthorization,
    PostPublicJwtAuthorization,
    PostPublicSignatureAuthorization,
    PostPublicTableauAuthorization,
    PostPublicTbaAuthorization,
    PostPublicTwoStepAuthorization,
    PostPublicUnauthenticatedAuthorization
} from './auth/http.api';
import type {
    DeleteConnectSession,
    GetConnectSession,
    PostConnectSessions,
    PostInternalConnectSessions,
    PostPublicConnectSessionsReconnect,
    PostPublicConnectTelemetry
} from './connect/api';
import type {
    DeletePublicConnection,
    GetConnection,
    GetConnections,
    GetConnectionsCount,
    GetPublicConnection,
    GetPublicConnections,
    PostConnectionRefresh
} from './connection/api/get';
import type { SetMetadata, UpdateMetadata } from './connection/api/metadata';
import type { PostDeploy, PostDeployConfirmation, PostDeployInternal } from './deploy/api';
import type { PatchEnvironment, PostEnvironment } from './environment/api';
import type { PatchWebhook } from './environment/api/webhook';
import type { PostEnvironmentVariables } from './environment/variable/api';
import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from './flow/http.api';
import type {
    DeleteIntegration,
    DeletePublicIntegration,
    GetIntegration,
    GetIntegrationFlows,
    GetPublicIntegration,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    PatchIntegration,
    PostIntegration
} from './integration/api';
import type { DeleteInvite, GetInvite, PostInvite } from './invitations/api';
import type { GetOperation, PostInsights, SearchFilters, SearchMessages, SearchOperations } from './logs/api';
import type { GetMeta } from './meta/api';
import type { PatchOnboarding } from './onboarding/api';
import type { GetPublicProvider, GetPublicProviders } from './providers/api';
import type { GetPublicRecords } from './record/api';
import type { GetPublicScriptsConfig } from './scripts/http.api';
import type { PostPublicTrigger } from './sync/api';
import type { DeleteTeamUser, GetTeam, PutTeam } from './team/api';
import type { GetUser, PatchUser } from './user/api';
import type { PostPublicWebhook } from './webhooks/http.api';

export type PublicApiEndpoints =
    | SetMetadata
    | UpdateMetadata
    | PostDeploy
    | PostDeployConfirmation
    | PostPublicTrigger
    | PostPublicTbaAuthorization
    | PostPublicTableauAuthorization
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
    | PostPublicConnectTelemetry;

export type PrivateApiEndpoints =
    | PostSignup
    | PostSignin
    | PostLogout
    | GetTeam
    | PutTeam
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
    | PatchWebhook
    | PostEnvironmentVariables;

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
