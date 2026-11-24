import { RefreshCwIcon } from 'lucide-react';

import { Button, FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON, PermissionGate } from '@/components/patterns/PermissionGate';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';

import type { ApiConnectionFull, OAuth2Credentials } from '@nangohq/types';

export const OAuth2CredentialsComponent: React.FC<{
    credentials: OAuth2Credentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
    canRead: boolean;
}> = ({ credentials, connection, providerConfigKey, canRead }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="access_token">Access token</FieldLabel>
                <div className="flex gap-2 items-center">
                    <SecretInput id="access_token" value={credentials.access_token} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                    {credentials.refresh_token && (
                        <PermissionGate condition={canRead} asChild>
                            {(allowed) => (
                                <Button variant="outline" size="md" onClick={forceRefresh} loading={isRefreshing} disabled={!allowed}>
                                    <RefreshCwIcon />
                                    Refresh
                                </Button>
                            )}
                        </PermissionGate>
                    )}
                </div>
            </div>

            {credentials.refresh_token && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="refresh_token">Refresh token</FieldLabel>
                    <SecretInput id="refresh_token" value={credentials.refresh_token} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                </div>
            )}

            {credentials.config_override && (
                <>
                    {credentials.config_override.client_id && (
                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="client_id_override">Client ID override</FieldLabel>
                            <SecretInput
                                id="client_id_override"
                                value={credentials.config_override.client_id}
                                canReveal={canRead}
                                disabledReason={PERMISSION_DENIED_REASON}
                            />
                        </div>
                    )}

                    {credentials.config_override.client_secret && (
                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="client_secret_override">Client secret override</FieldLabel>
                            <SecretInput
                                id="client_secret_override"
                                value={credentials.config_override.client_secret}
                                canReveal={canRead}
                                disabledReason={PERMISSION_DENIED_REASON}
                            />
                        </div>
                    )}
                </>
            )}
        </>
    );
};
