import type { EndpointMethod } from './api';
import type { GetOperation, SearchFilters, SearchMessages, SearchOperations } from './logs/api';
import type { GetOnboardingStatus } from './onboarding/api';
import type { SetMetadata, UpdateMetadata } from './connection/api/metadata';
import type { PostDeploy, PostDeployConfirmation } from './deploy/api';
import type { DeleteTeamUser, GetTeam, PutTeam } from './team/api';
import type { PostForgotPassword, PutResetPassword, Signin, Signup } from './account/api';
import type { DeleteInvite, PostInvite } from './invitations/api';

export type APIEndpoints =
    | Signup
    | Signin
    | GetTeam
    | PutTeam
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
    | PostDeployConfirmation;

/**
 * Automatically narrow endpoints type with Method + Path
 */
export type APIEndpointsPicker<TMethod extends EndpointMethod, TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Method: TMethod; Path: TPath }>;

/**
 * Automatically narrow endpoints type with Path
 * Useful to get allowed methods
 */
export type APIEndpointsPickerWithPath<TPath extends APIEndpoints['Path']> = Extract<APIEndpoints, { Path: TPath }>;
