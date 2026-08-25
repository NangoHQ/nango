import { FieldLabel } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { OAuth1Credentials } from '@nangohq/types';

export const OAuth1CredentialsComponent: React.FC<{
    credentials: OAuth1Credentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="oauth_token">OAuth token</FieldLabel>
                <SecretInput id="oauth_token" value={credentials.oauth_token} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="oauth_token_secret">OAuth token secret</FieldLabel>
                <SecretInput id="oauth_token_secret" value={credentials.oauth_token_secret} disabled copy canRead={canRead} />
            </div>
        </>
    );
};
