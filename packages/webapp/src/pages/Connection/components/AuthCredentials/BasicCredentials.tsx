import { FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON } from '@/components/patterns/PermissionGate';

import type { BasicApiCredentials } from '@nangohq/types';

export const BasicCredentialsComponent: React.FC<{
    credentials: BasicApiCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <SecretInput id="username" value={credentials.username} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <SecretInput id="password" value={credentials.password} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>
        </>
    );
};
