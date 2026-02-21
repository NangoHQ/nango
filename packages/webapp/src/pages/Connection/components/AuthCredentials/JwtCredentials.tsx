import { RefreshCwIcon } from 'lucide-react';

import { SecretInput } from '@/components-v2/SecretInput';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';
import { useRefreshConnectionWithToast } from '@/hooks/useRefreshConnectionWithToast';
import { formatKeyToLabel } from '@/utils/utils';

import type { ApiConnectionFull, JwtCredentials } from '@nangohq/types';

export const JwtCredentialsComponent: React.FC<{
    credentials: JwtCredentials;
    connection: ApiConnectionFull;
    providerConfigKey: string;
}> = ({ credentials, connection, providerConfigKey }) => {
    const { forceRefresh, isRefreshing } = useRefreshConnectionWithToast(connection, providerConfigKey);

    return (
        <>
            {credentials.token && (
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
            )}

            {/* Special handling for Private key (based on legacy code before redesign) */}
            {'privateKey' in credentials && 'id' in credentials.privateKey && 'secret' in credentials.privateKey && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="privateKey">Private key</Label>
                    <SecretInput id="privateKey" value={`${credentials.privateKey.id}:${credentials.privateKey.secret}`} disabled copy />
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
                        <Label htmlFor={key}>{label}</Label>
                        <SecretInput id={key} value={value} disabled copy />
                    </div>
                );
            })}
        </>
    );
};
