import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { BasicApiCredentials } from '@nangohq/types';

export const BasicCredentialsComponent: React.FC<{
    credentials: BasicApiCredentials;
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
        </>
    );
};
