import { SecretInput } from '@/components/patterns/SecretInput';
import { Label } from '@/components/ui/Label';

import type { BasicApiCredentials } from '@nangohq/types';

export const BasicCredentialsComponent: React.FC<{
    credentials: BasicApiCredentials;
    canRead: boolean;
}> = ({ credentials, canRead }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="username">Username</Label>
                <SecretInput id="username" value={credentials.username} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <SecretInput id="password" value={credentials.password} disabled copy canRead={canRead} />
            </div>
        </>
    );
};
