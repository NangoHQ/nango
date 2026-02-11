import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { AppCredentials } from '@nangohq/types';

export const AppCredentialsComponent: React.FC<{
    credentials: AppCredentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="access_token">Access token</Label>
                <SecretInput id="access_token" value={credentials.access_token} disabled copy />
            </div>

            {credentials.jwtToken && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="jwt_token">JWT token</Label>
                    <SecretInput id="jwt_token" value={credentials.jwtToken} disabled copy />
                </div>
            )}
        </>
    );
};
