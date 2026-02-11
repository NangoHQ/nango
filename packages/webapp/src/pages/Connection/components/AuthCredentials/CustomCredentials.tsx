import { AppCredentialsComponent } from './AppCredentials';
import { OAuth2CredentialsComponent } from './OAuth2Credentials';

import type { CombinedOauth2AppCredentials, CustomCredentials } from '@nangohq/types';

export const CustomCredentialsComponent: React.FC<{ credentials: CustomCredentials | CombinedOauth2AppCredentials }> = ({ credentials }) => {
    return (
        <>
            {'app' in credentials && credentials.app && <AppCredentialsComponent credentials={credentials.app} />}
            {'user' in credentials && credentials.user && <OAuth2CredentialsComponent credentials={credentials.user} />}
        </>
    );
};
