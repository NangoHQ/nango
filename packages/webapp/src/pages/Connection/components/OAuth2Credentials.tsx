import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { OAuth2Credentials } from '@nangohq/types';

export const OAuth2CredentialsComponent: React.FC<{
    credentials: OAuth2Credentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="access_token">Access token</Label>
                <SecretInput id="access_token" value={credentials.access_token} disabled copy />
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
