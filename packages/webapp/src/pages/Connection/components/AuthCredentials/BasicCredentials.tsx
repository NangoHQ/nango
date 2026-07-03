import { FieldLabel } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { BasicApiCredentials } from '@nangohq/types';

export const BasicCredentialsComponent: React.FC<{
    credentials: BasicApiCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <SecretInput id="username" value={credentials.username} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <SecretInput id="password" value={credentials.password} disabled copy canRead={canRead} />
            </div>
        </>
    );
};
