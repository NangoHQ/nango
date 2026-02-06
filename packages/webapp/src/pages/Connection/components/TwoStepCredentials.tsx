import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';
import { formatKeyToLabel } from '@/utils/utils';

import type { TwoStepCredentials } from '@nangohq/types';

export const TwoStepCredentialsComponent: React.FC<{
    credentials: TwoStepCredentials;
}> = ({ credentials }) => {
    return (
        <>
            {credentials.token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="token">Token</Label>
                    <SecretInput id="token" value={credentials.token} disabled copy />
                </div>
            )}

            {credentials.refresh_token && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="refresh_token">Refresh token</Label>
                    <SecretInput id="refresh_token" value={credentials.refresh_token} disabled copy />
                </div>
            )}

            {/* Special handling for Private key (based on legacy code before redesign) */}
            {'privateKey' in credentials && 'id' in credentials.privateKey && 'secret' in credentials.privateKey && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="privateKey">Private key</Label>
                    <SecretInput id="privateKey" value={credentials.privateKey} disabled copy />
                </div>
            )}

            {/* Other free-form strings */}
            {Object.entries(credentials).map(([key, value]) => {
                if (['type', 'token', 'refresh_token', 'expires_at', 'raw', 'privateKey'].includes(key) || typeof value !== 'string') {
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
