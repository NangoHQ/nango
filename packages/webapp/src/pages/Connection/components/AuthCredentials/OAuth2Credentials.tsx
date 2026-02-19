import { RefreshCwIcon } from 'lucide-react';

import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';

import type { ApiConnectionFull, OAuth2Credentials } from '@nangohq/types';

export const OAuth2CredentialsComponent: React.FC<{
    connection: ApiConnectionFull;
    credentials: OAuth2Credentials;
    providerConfigKey: string;
}> = ({ connection, credentials, providerConfigKey }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="access_token">Access token</Label>
                <div className="flex gap-2 items-center">
                    <SecretInput id="access_token" value={credentials.access_token} disabled copy />
                    {credentials.refresh_token && (
                        <Button variant="secondary" size="sm" className="h-full" onClick={forceRefresh} loading={isRefreshing}>
                            <RefreshCwIcon />
                            Refresh
                        </Button>
                    )}
                </div>
            </div>

            {credentials.refresh_token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="refresh_token">Refresh token</Label>
                    <SecretInput id="refresh_token" value={credentials.refresh_token} disabled copy />
                </div>
            )}

            {credentials.config_override && (
                <>
                    {credentials.config_override.client_id && (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_id_override">Client ID override</Label>
                            <SecretInput id="client_id_override" value={credentials.config_override.client_id} disabled copy />
                        </div>
                    )}

                    {credentials.config_override.client_secret && (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_secret_override">Client secret override</Label>
                            <SecretInput id="client_secret_override" value={credentials.config_override.client_secret} disabled copy />
                        </div>
                    )}
                </>
            )}
        </>
    );
};
