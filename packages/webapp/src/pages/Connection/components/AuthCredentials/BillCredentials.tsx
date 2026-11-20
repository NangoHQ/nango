import { FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON } from '@/components/patterns/PermissionGate';

import type { BillCredentials } from '@nangohq/types';

export const BillCredentialsComponent: React.FC<{
    credentials: BillCredentials;
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

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="organization_id">Organization ID</FieldLabel>
                <SecretInput id="organization_id" value={credentials.organization_id} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="dev_key">Dev key</FieldLabel>
                <SecretInput id="dev_key" value={credentials.dev_key} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>

            {credentials.session_id && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="session_id">Session ID</FieldLabel>
                    <SecretInput id="session_id" value={credentials.session_id} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                </div>
            )}

            {credentials.user_id && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="user_id">User ID</FieldLabel>
                    <SecretInput id="user_id" value={credentials.user_id} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                </div>
            )}
        </>
    );
};
