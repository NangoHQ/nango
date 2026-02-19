import { AppCredentialsComponent } from './AppCredentials';
import { OAuth2CredentialsComponent } from './OAuth2Credentials';

import type { ApiConnectionFull, CombinedOauth2AppCredentials, CustomCredentials } from '@nangohq/types';

export const CustomCredentialsComponent: React.FC<{
    connection: ApiConnectionFull;
    credentials: CustomCredentials | CombinedOauth2AppCredentials;
    providerConfigKey: string;
}> = ({ connection, credentials, providerConfigKey }) => {
    return (
        <>
            {'app' in credentials && credentials.app && <AppCredentialsComponent credentials={credentials.app} />}
            {'user' in credentials && credentials.user && (
                <OAuth2CredentialsComponent connection={connection} credentials={credentials.user} providerConfigKey={providerConfigKey} />
            )}
        </>
    );
};
