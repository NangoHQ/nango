import { ApiKeyCredentialsComponent } from './ApiKeyCredentials';
import { AppCredentialsComponent } from './AppCredentials';
import { AppStoreCredentialsComponent } from './AppStoreCredentials';
import { BasicCredentialsComponent } from './BasicCredentials';
import { BillCredentialsComponent } from './BillCredentials';
import { CustomCredentialsComponent } from './CustomCredentials';
import { JwtCredentialsComponent } from './JwtCredentials';
import { OAuth1CredentialsComponent } from './OAuth1Credentials';
import { OAuth2ClientCredentialsComponent } from './OAuth2ClientCredentials';
import { OAuth2CredentialsComponent } from './OAuth2Credentials';
import { SignatureCredentialsComponent } from './SignatureCredentials';
import { TbaCredentialsComponent } from './TbaCredentials';
import { TwoStepCredentialsComponent } from './TwoStepCredentials';
import { useEnvironment } from '@/hooks/useEnvironment';
import { permissions, usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';

import type { ApiConnectionFull, BasicApiCredentials } from '@nangohq/types';

interface AuthCredentialsProps {
    connection: ApiConnectionFull;
    providerConfigKey: string;
}

export const AuthCredentials: React.FC<AuthCredentialsProps> = ({ connection, providerConfigKey }) => {
    const { credentials } = connection;

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;

    const { can } = usePermissions();
    const canReadConnectionCredentials = can(permissions.canReadProdConnectionCredentials) || !environment?.is_production;

    return (
        <>
            {credentials.type === 'OAUTH2' && (
                <OAuth2CredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}
            {credentials.type === 'OAUTH1' && <OAuth1CredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'OAUTH2_CC' && (
                <OAuth2ClientCredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}

            {/* Could be InstallPlugin */}
            {credentials.type === 'BASIC' && 'username' in credentials && 'password' in credentials && (
                <BasicCredentialsComponent credentials={credentials as BasicApiCredentials} canRead={canReadConnectionCredentials} />
            )}

            {credentials.type === 'API_KEY' && <ApiKeyCredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'APP' && <AppCredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'APP_STORE' && <AppStoreCredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'TBA' && <TbaCredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'JWT' && (
                <JwtCredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}
            {credentials.type === 'BILL' && <BillCredentialsComponent credentials={credentials} canRead={canReadConnectionCredentials} />}
            {credentials.type === 'TWO_STEP' && (
                <TwoStepCredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}
            {credentials.type === 'SIGNATURE' && (
                <SignatureCredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}

            {/* Custom and CombinedOauth2AppCredentials */}
            {credentials.type === 'CUSTOM' && (
                <CustomCredentialsComponent
                    credentials={credentials}
                    connection={connection}
                    providerConfigKey={providerConfigKey}
                    canRead={canReadConnectionCredentials}
                />
            )}
        </>
    );
};
