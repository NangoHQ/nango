import { RefreshCwIcon } from 'lucide-react';

import { Button, FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON, PermissionGate } from '@/components/patterns/PermissionGate';
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
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <SecretInput id="username" value={credentials.username} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <SecretInput id="password" value={credentials.password} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
            </div>

            {credentials.token && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="token">Token</FieldLabel>
                    <div className="flex gap-2 items-center">
                        <SecretInput id="token" value={credentials.token} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                        <PermissionGate condition={canRead} asChild>
                            {(allowed) => (
                                <Button variant="outline" size="md" onClick={forceRefresh} loading={isRefreshing} disabled={!allowed}>
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
