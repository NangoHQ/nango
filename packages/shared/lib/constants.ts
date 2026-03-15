export const PROD_ENVIRONMENT_NAME = 'prod';

/**
 * Auth modes for which connection credentials can be refreshed (re-obtained) via refreshCredentials.
 */
export const REFRESHABLE_AUTH_MODES = new Set<string>(['OAUTH2', 'APP', 'OAUTH2_CC', 'JWT', 'BILL', 'TWO_STEP', 'SIGNATURE']);
