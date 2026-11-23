import { RefreshCwIcon } from 'lucide-react';

import { Button, FieldLabel, SecretInput } from '@nangohq/design-system';

import { PERMISSION_DENIED_REASON, PermissionGate } from '@/components/patterns/PermissionGate';
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

            {credentials.refresh_token && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="refresh_token">Refresh token</FieldLabel>
                    <SecretInput id="refresh_token" value={credentials.refresh_token} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
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
                        <FieldLabel htmlFor={key}>{label}</FieldLabel>
                        <SecretInput id={key} value={value} canReveal={canRead} disabledReason={PERMISSION_DENIED_REASON} />
                    </div>
                );
            })}
        </>
    );
};
