import { FieldLabel } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { AppCredentials } from '@nangohq/types';

export const AppCredentialsComponent: React.FC<{
    credentials: AppCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="access_token">Access token</FieldLabel>
                <SecretInput id="access_token" value={credentials.access_token} disabled copy canRead={canRead} />
            </div>

            {credentials.jwtToken && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="jwt_token">JWT token</FieldLabel>
                    <SecretInput id="jwt_token" value={credentials.jwtToken} disabled copy canRead={canRead} />
                </div>
            )}
        </>
    );
};
