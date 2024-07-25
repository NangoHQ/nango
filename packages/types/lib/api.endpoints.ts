import type { EndpointMethod } from './api';
import type { GetOperation, SearchFilters, SearchMessages, SearchOperations } from './logs/api';
import type { GetOnboardingStatus } from './onboarding/api';
import type { SetMetadata, UpdateMetadata } from './connection/api/metadata';
import type { PostDeploy, PostDeployConfirmation } from './deploy/api';
import type { DeleteTeamUser, GetTeam, PutTeam } from './team/api';
import type { PostForgotPassword, PutResetPassword, PostSignin, PostSignup } from './account/api';
import type { DeleteInvite, PostInvite } from './invitations/api';
import type { GetUser, PatchUser } from './user/api';
import type { GetListIntegrations } from './integration/api';

export type APIEndpoints =
    | PostSignup
    | PostSignin
    | GetTeam
    | PutTeam
    | GetUser
    | PatchUser
    | PostInvite
    | DeleteInvite
    | DeleteTeamUser
    | PostForgotPassword
    | PutResetPassword
    | SearchOperations
    | GetOperation
    | SearchMessages
    | SearchFilters
    | GetOnboardingStatus
    | SetMetadata
    | UpdateMetadata
    | PostDeploy
    | PostDeployConfirmation
    | GetListIntegrations;

/**
 * Automatically narrow endpoints type with Method + Path
 */
export type APIEndpointsPicker<TMethod extends EndpointMethod, TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Method: TMethod; Path: TPath }>;

/**
 * Automatically narrow endpoints type with Path
 * Useful to get allowed methods
 */
export type APIEndpointsPickerWithPath<TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Path: TPath }>;
