import type { SharedCredentials } from './db.js';

export type SharedCredentialsInputDto = Pick<SharedCredentials, 'oauth_client_id' | 'oauth_client_secret' | 'oauth_scopes'>;
