import { RefreshCwIcon } from 'lucide-react';

import { Button, FieldLabel } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { SecretInput } from '@/components/patterns/SecretInput';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';
import { formatKeyToLabel } from '@/utils/utils';

import type { ApiConnectionFull, JwtCredentials } from '@nangohq/types';

export const JwtCredentialsComponent: React.FC<{
    credentials: JwtCredentials;
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
                        <SecretInput id="token" value={credentials.token} disabled copy canRead={canRead} />
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

            {/* Special handling for Private key (based on legacy code before redesign) */}
            {'privateKey' in credentials && credentials.privateKey != null && (
                <div className="flex flex-col gap-2">
                    <FieldLabel htmlFor="privateKey">Private key</FieldLabel>
                    <SecretInput
                        id="privateKey"
                        value={
                            typeof credentials.privateKey === 'object' && 'id' in credentials.privateKey && 'secret' in credentials.privateKey
                                ? `${credentials.privateKey.id}:${credentials.privateKey.secret}`
                                : typeof credentials.privateKey === 'string'
                                  ? credentials.privateKey
                                  : ''
                        }
                        disabled
                        copy
                        canRead={canRead}
                    />
                </div>
            )}

            {/* Other free-form strings */}
            {Object.entries(credentials).map(([key, value]) => {
                if (['type', 'token', 'expires_at', 'raw', 'privateKey'].includes(key) || typeof value !== 'string') {
                    return null;
                }

                const label = formatKeyToLabel(key);

                return (
                    <div className="flex flex-col gap-2" key={key}>
                        <FieldLabel htmlFor={key}>{label}</FieldLabel>
                        <SecretInput id={key} value={value} disabled copy canRead={canRead} />
                    </div>
                );
            })}
        </>
    );
};
