import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { BillCredentials } from '@nangohq/types';

export const BillCredentialsComponent: React.FC<{
    credentials: BillCredentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="username">Username</Label>
                <SecretInput id="username" value={credentials.username} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <SecretInput id="password" value={credentials.password} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="organization_id">Organization ID</Label>
                <SecretInput id="organization_id" value={credentials.organization_id} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="dev_key">Dev key</Label>
                <SecretInput id="dev_key" value={credentials.dev_key} disabled copy />
            </div>

            {credentials.session_id && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="session_id">Session ID</Label>
                    <SecretInput id="session_id" value={credentials.session_id} disabled copy />
                </div>
            )}

            {credentials.user_id && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="user_id">User ID</Label>
                    <SecretInput id="user_id" value={credentials.user_id} disabled copy />
                </div>
            )}
        </>
    );
};
