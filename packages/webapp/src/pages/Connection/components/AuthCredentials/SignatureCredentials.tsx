import { RefreshCwIcon } from 'lucide-react';

import { Button, FieldLabel } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { SecretInput } from '@/components/patterns/SecretInput';
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
                <SecretInput id="username" value={credentials.username} disabled copy canRead={canRead} />
            </div>

            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <SecretInput id="password" value={credentials.password} disabled copy canRead={canRead} />
            </div>

            {credentials.token && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="token">Token</FieldLabel>
                    <div className="flex gap-2 items-center">
                        <SecretInput id="token" value={credentials.token} disabled copy canRead={canRead} />
                        <PermissionGate condition={canRead} asChild>
                            {(allowed) => (
                                <Button variant="outline" size="lg" onClick={forceRefresh} loading={isRefreshing} disabled={!allowed}>
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
