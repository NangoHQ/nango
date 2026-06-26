import { FieldLabel } from '@nangohq/design-system';

import { SecretInput } from '@/components/patterns/SecretInput';

import type { BillCredentials } from '@nangohq/types';

export const BillCredentialsComponent: React.FC<{
    credentials: BillCredentials;
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

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="organization_id">Organization ID</FieldLabel>
                <SecretInput id="organization_id" value={credentials.organization_id} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="dev_key">Dev key</FieldLabel>
                <SecretInput id="dev_key" value={credentials.dev_key} disabled copy canRead={canRead} />
            </div>

            {credentials.session_id && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="session_id">Session ID</FieldLabel>
                    <SecretInput id="session_id" value={credentials.session_id} disabled copy canRead={canRead} />
                </div>
            )}

            {credentials.user_id && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="user_id">User ID</FieldLabel>
                    <SecretInput id="user_id" value={credentials.user_id} disabled copy canRead={canRead} />
                </div>
            )}
        </>
    );
};
