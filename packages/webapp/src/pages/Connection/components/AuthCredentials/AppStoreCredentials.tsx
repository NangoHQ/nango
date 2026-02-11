import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { AppStoreCredentials } from '@nangohq/types';

export const AppStoreCredentialsComponent: React.FC<{
    credentials: AppStoreCredentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="access_token">Access token</Label>
                <SecretInput id="access_token" value={credentials.access_token} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="private_key">Private key</Label>
                <SecretInput id="private_key" value={credentials.private_key} disabled copy />
            </div>
        </>
    );
};
