import { FieldLabel } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { AppStoreCredentials } from '@nangohq/types';

export const AppStoreCredentialsComponent: React.FC<{
    credentials: AppStoreCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="access_token">Access token</FieldLabel>
                <SecretInput id="access_token" value={credentials.access_token} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="private_key">Private key</FieldLabel>
                <SecretInput id="private_key" value={credentials.private_key} disabled copy canRead={canRead} />
            </div>
        </>
    );
};
