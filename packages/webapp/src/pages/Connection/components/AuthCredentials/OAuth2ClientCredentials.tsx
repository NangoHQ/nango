import { RefreshCwIcon } from 'lucide-react';

import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';

import type { ApiConnectionFull, OAuth2ClientCredentials } from '@nangohq/types';

export const OAuth2ClientCredentialsComponent: React.FC<{
    credentials: OAuth2ClientCredentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
}> = ({ credentials, connection, providerConfigKey }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="token">Token</Label>
                <div className="flex gap-2 items-center">
                    <SecretInput id="token" value={credentials.token} disabled copy />
                    <Button variant="secondary" size="sm" className="h-full" onClick={forceRefresh} loading={isRefreshing}>
                        <RefreshCwIcon />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="client_id">Client ID</Label>
                <SecretInput id="client_id" value={credentials.client_id} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="client_secret">Client secret</Label>
                <SecretInput id="client_secret" value={credentials.client_secret} disabled copy />
            </div>

            {credentials.client_certificate && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="client_certificate">Client certificate</Label>
                    <SecretInput id="client_certificate" value={credentials.client_certificate} disabled copy />
                </div>
            )}

            {credentials.client_private_key && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="client_private_key">Client private Key</Label>
                    <SecretInput id="client_private_key" value={credentials.client_private_key} disabled copy />
                </div>
            )}
        </>
    );
};
