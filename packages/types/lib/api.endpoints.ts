import type { EndpointMethod } from './api';
import type { GetOperation, PostInsights, SearchFilters, SearchMessages, SearchOperations } from './logs/api';
import type { GetOnboardingStatus } from './onboarding/api';
import type { SetMetadata, UpdateMetadata } from './connection/api/metadata';
import type { PostDeploy, PostDeployConfirmation, PostDeployInternal } from './deploy/api';
import type { DeleteTeamUser, GetTeam, PutTeam } from './team/api';
import type {
    PostForgotPassword,
    PutResetPassword,
    PostSignin,
    PostSignup,
    GetEmailByExpiredToken,
    GetEmailByUuid,
    GetManagedCallback,
    PostManagedSignup
} from './account/api';
import type { DeleteInvite, GetInvite, PostInvite } from './invitations/api';
import type { GetUser, PatchUser } from './user/api';
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
import type {
    PostPublicTableauAuthorization,
    PostPublicTbaAuthorization,
    PostPublicUnauthenticatedAuthorization,
    PostPublicJwtAuthorization,
    PostPublicBillAuthorization,
    PostPublicSignatureAuthorization,
    PostPublicTwoStepAuthorization
} from './auth/http.api';
import type { GetPublicProvider, GetPublicProviders } from './providers/api';
import type { DeleteConnectSession, GetConnectSession, PostConnectSessions, PostInternalConnectSessions } from './connect/api';
import type {
    DeletePublicConnection,
    GetConnection,
    GetConnections,
    GetConnectionsCount,
    GetPublicConnections,
    PostConnectionRefresh
} from './connection/api/get';
import type { GetMeta } from './meta/api';
import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from './flow/http.api';

export type PublicApiEndpoints =
    | SetMetadata
    | UpdateMetadata
    | PostDeploy
    | PostDeployConfirmation
    | PostPublicTbaAuthorization
    | PostPublicTableauAuthorization
    | PostPublicJwtAuthorization
    | PostPublicUnauthenticatedAuthorization
    | GetPublicProviders
    | GetPublicProvider
    | GetPublicListIntegrationsLegacy
    | GetPublicListIntegrations
    | GetPublicIntegration
    | DeletePublicIntegration
    | PostConnectSessions
    | GetPublicConnections
    | GetConnectSession
    | DeleteConnectSession
    | PostDeployInternal
    | PostPublicBillAuthorization
    | DeletePublicConnection
    | PostPublicSignatureAuthorization
    | PostPublicTwoStepAuthorization;
export type PrivateApiEndpoints =
    | PostSignup
    | PostSignin
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
    | GetOnboardingStatus
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
    | PostPreBuiltDeploy;
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
