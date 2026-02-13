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

import type { AllAuthCredentials, BasicApiCredentials } from '@nangohq/types';

interface AuthCredentialsProps {
    credentials: AllAuthCredentials;
}

export const AuthCredentials: React.FC<AuthCredentialsProps> = ({ credentials }) => {
    return (
        <>
            {credentials.type === 'OAUTH2' && <OAuth2CredentialsComponent credentials={credentials} />}
            {credentials.type === 'OAUTH1' && <OAuth1CredentialsComponent credentials={credentials} />}
            {credentials.type === 'OAUTH2_CC' && <OAuth2ClientCredentialsComponent credentials={credentials} />}

            {/* Could be InstallPlugin */}
            {credentials.type === 'BASIC' && 'username' in credentials && 'password' in credentials && (
                <BasicCredentialsComponent credentials={credentials as BasicApiCredentials} />
            )}

            {credentials.type === 'API_KEY' && <ApiKeyCredentialsComponent credentials={credentials} />}
            {credentials.type === 'APP' && <AppCredentialsComponent credentials={credentials} />}
            {credentials.type === 'APP_STORE' && <AppStoreCredentialsComponent credentials={credentials} />}
            {credentials.type === 'TBA' && <TbaCredentialsComponent credentials={credentials} />}
            {credentials.type === 'JWT' && <JwtCredentialsComponent credentials={credentials} />}
            {credentials.type === 'BILL' && <BillCredentialsComponent credentials={credentials} />}
            {credentials.type === 'TWO_STEP' && <TwoStepCredentialsComponent credentials={credentials} />}
            {credentials.type === 'SIGNATURE' && <SignatureCredentialsComponent credentials={credentials} />}

            {/* Custom and CombinedOauth2AppCredentials */}
            {credentials.type === 'CUSTOM' && <CustomCredentialsComponent credentials={credentials} />}
        </>
    );
};
