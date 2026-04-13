import { RefreshCwIcon } from 'lucide-react';

import { PermissionGate } from '@/components-v2/PermissionGate';
import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';

import type { ApiConnectionFull, OAuth2ClientCredentials } from '@nangohq/types';

export const OAuth2ClientCredentialsComponent: React.FC<{
    credentials: OAuth2ClientCredentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
    canRead: boolean;
}> = ({ credentials, connection, providerConfigKey, canRead }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
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

            <div className="flex flex-col gap-2">
                <Label htmlFor="client_id">Client ID</Label>
                <SecretInput id="client_id" value={credentials.client_id} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="client_secret">Client secret</Label>
                <SecretInput id="client_secret" value={credentials.client_secret} disabled copy canRead={canRead} />
            </div>

            {credentials.client_certificate && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="client_certificate">Client certificate</Label>
                    <SecretInput id="client_certificate" value={credentials.client_certificate} disabled copy canRead={canRead} />
                </div>
            )}

            {credentials.client_private_key && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="client_private_key">Client private Key</Label>
                    <SecretInput id="client_private_key" value={credentials.client_private_key} disabled copy canRead={canRead} />
                </div>
            )}
        </>
    );
};
