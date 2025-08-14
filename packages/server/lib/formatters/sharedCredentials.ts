import type { DBSharedCredentials, SharedCredentialsOutput } from '@nangohq/types';

export function sharedCredentialsToApi(provider: DBSharedCredentials): SharedCredentialsOutput {
    return {
        id: provider.id,
        name: provider.name,
        credentials: {
            client_id: provider.credentials.oauth_client_id,
            client_secret: provider.credentials.oauth_client_secret,
            scopes: provider.credentials.oauth_scopes
        },
        created_at: provider.created_at.toISOString(),
        updated_at: provider.updated_at.toISOString()
    };
}
