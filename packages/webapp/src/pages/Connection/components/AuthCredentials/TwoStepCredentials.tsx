import { RefreshCwIcon } from 'lucide-react';

import { Button, Label } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { SecretInput } from '@/components/patterns/SecretInput';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';
import { formatKeyToLabel } from '@/utils/utils';

import type { ApiConnectionFull, TwoStepCredentials } from '@nangohq/types';

export const TwoStepCredentialsComponent: React.FC<{
    credentials: TwoStepCredentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
    canRead: boolean;
}> = ({ credentials, connection, providerConfigKey, canRead }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
            {credentials.token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="token">Token</Label>
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

            {credentials.refresh_token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="refresh_token">Refresh token</Label>
                    <SecretInput id="refresh_token" value={credentials.refresh_token} disabled copy canRead={canRead} />
                </div>
            )}

            {/* Other free-form strings */}
            {Object.entries(credentials).map(([key, value]) => {
                if (['type', 'token', 'refresh_token', 'expires_at', 'raw'].includes(key) || typeof value !== 'string') {
                    return null;
                }

                const label = formatKeyToLabel(key);

                return (
                    <div className="flex flex-col gap-2" key={key}>
                        <Label htmlFor={key}>{label}</Label>
                        <SecretInput id={key} value={value} disabled copy canRead={canRead} />
                    </div>
                );
            })}
        </>
    );
};
