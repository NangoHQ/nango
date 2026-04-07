import { RefreshCwIcon } from 'lucide-react';

import { PermissionGate } from '@/components-v2/PermissionGate';
import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';

import type { ApiConnectionFull, SignatureCredentials } from '@nangohq/types';

export const SignatureCredentialsComponent: React.FC<{
    credentials: SignatureCredentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
    canRead: boolean;
}> = ({ credentials, connection, providerConfigKey, canRead }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

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

            {credentials.token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="token">Token</Label>
                    <div className="flex gap-2 items-center">
                        <SecretInput id="token" value={credentials.token} disabled copy canRead={canRead} />
                        <PermissionGate condition={canRead} asChild>
                            {(allowed) => (
                                <Button variant="secondary" size="sm" className="h-full" onClick={forceRefresh} loading={isRefreshing} disabled={!allowed}>
                                    <RefreshCwIcon />
                                    Refresh
                                </Button>
                            )}
                        </PermissionGate>
                    </div>
                </div>
            )}
        </>
    );
};
